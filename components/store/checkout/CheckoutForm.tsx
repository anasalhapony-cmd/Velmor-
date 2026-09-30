'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCart } from '@/stores/cart-store';
import { checkoutFormSchema, type CheckoutFormValues } from '@/lib/validation/schemas';
import { formatPrice } from '@/lib/utils/money';
import { trackEvent } from '@/lib/analytics/client';
import { Icon } from '@/components/store/ui';
import { unitAr } from '@/components/store/commerce/AddToBag';
import type { Quote } from '@/types';
import { Photo } from '@/components/store/photo';

interface Zone {
  id: string;
  name: string;
  city: string;
  fee: number;
}

/**
 * Cash-on-delivery checkout. Every number shown here comes from the server
 * quote (quote_order_v2); the order itself is created atomically server-side
 * with an idempotency key, so double clicks / retries never duplicate it.
 */
export function CheckoutForm({ zones, giftWrapEnabled }: { zones: Zone[]; giftWrapEnabled: boolean }) {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const syncPrices = useCart((s) => s.syncPrices);
  const [mounted, setMounted] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>(undefined);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [badVariant, setBadVariant] = useState<string | null>(null);
  const idempotencyKey = useRef<string>('');

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: { delivery_zone_id: '', gift_wrap: false },
  });

  useEffect(() => {
    setMounted(true);
    idempotencyKey.current =
      globalThis.crypto?.randomUUID?.() ??
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    trackEvent('begin_checkout');
  }, []);

  const zoneId = watch('delivery_zone_id');
  const giftWrap = watch('gift_wrap') && giftWrapEnabled;
  const cartItems = useMemo(() => items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })), [items]);
  const cartKey = cartItems.map((i) => `${i.variant_id}:${i.quantity}`).join('|');

  async function fetchQuote(coupon: string | undefined) {
    if (cartItems.length === 0) return null;
    setQuoting(true);
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: cartItems,
          delivery_zone_id: zoneId || undefined,
          coupon_code: coupon || undefined,
          phone: getValues('phone') || undefined,
          gift_wrap: giftWrap || undefined,
        }),
      });
      const d = (await res.json().catch(() => null)) as { quote?: Quote } | null;
      if (d?.quote) {
        setQuote(d.quote);
        syncPrices(d.quote.items.map((l) => ({ variantId: l.variant_id, price: Number(l.unit_price) })));
        return d.quote;
      }
    } catch {
      /* keep the last good quote */
    } finally {
      setQuoting(false);
    }
    return null;
  }

  // Server quote on load and whenever zone / cart / gift wrap / coupon change.
  useEffect(() => {
    if (!mounted) return;
    void fetchQuote(appliedCoupon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, zoneId, cartKey, giftWrap, appliedCoupon]);

  async function applyCoupon() {
    const code = (getValues('coupon_code') ?? '').trim();
    if (!code) {
      setAppliedCoupon(undefined);
      setCouponMsg(null);
      return;
    }
    const q = await fetchQuote(code);
    if (q?.coupon?.valid) {
      setAppliedCoupon(code);
      setCouponMsg({ ok: true, text: `تم تطبيق الخصم: ${formatPrice(q.discount)}` });
    } else {
      setAppliedCoupon(undefined);
      const reason = q?.coupon?.reason;
      setCouponMsg({
        ok: false,
        text:
          reason === 'MIN_ORDER'
            ? 'قيمة الطلب أقل من الحد الأدنى لهذا الكوبون.'
            : reason === 'EXPIRED' || reason === 'NOT_STARTED'
              ? 'الكوبون غير متاح في هذا الوقت.'
              : reason === 'USAGE_LIMIT' || reason === 'PER_CUSTOMER_LIMIT'
                ? 'تم استخدام هذا الكوبون بالحد الأقصى.'
                : reason === 'NO_ELIGIBLE_ITEMS'
                  ? 'الكوبون لا ينطبق على منتجات سلتك.'
                  : 'الكوبون غير صالح.',
      });
    }
  }

  async function onSubmit(values: CheckoutFormValues) {
    if (items.length === 0 || submitting) return;
    setSubmitting(true);
    setServerError('');
    setBadVariant(null);
    const zone = zones.find((z) => z.id === values.delivery_zone_id);
    const payload = {
      customer_name: values.customer_name,
      phone: values.phone,
      whatsapp: values.whatsapp || undefined,
      city: zone?.city ?? '',
      area: zone?.name,
      address: values.address,
      delivery_note: values.delivery_note || undefined,
      delivery_zone_id: values.delivery_zone_id,
      coupon_code: appliedCoupon,
      payment_method: 'COD' as const,
      gift_wrap: giftWrap || undefined,
      gift_message: giftWrap ? values.gift_message || undefined : undefined,
      items: cartItems,
    };
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey.current },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201 && data.order) {
        try {
          sessionStorage.setItem('velmor-last-order', JSON.stringify(data.order));
        } catch {
          /* private mode — the success page falls back to tracking */
        }
        clear();
        router.push(`/checkout/success?order=${encodeURIComponent(data.order.order_number)}`);
        return;
      }
      if (data.variantId) setBadVariant(data.variantId as string);
      setServerError(data.error ?? 'تعذّر إنشاء الطلب. حاول مرة أخرى.');
      if (res.status === 409) void fetchQuote(appliedCoupon);
    } catch {
      setServerError('انقطع الاتصال قبل تأكيد الطلب. أعد المحاولة — لن يُنشأ الطلب مرتين.');
    }
    setSubmitting(false);
  }

  if (!mounted) return <div className="vp-co__loading" aria-busy="true" />;

  if (items.length === 0) {
    return (
      <div className="vp-empty vp-empty--light">
        <span className="vp-script" aria-hidden="true">
          empty
        </span>
        <h2>سلتك فارغة</h2>
        <p>أضف عطرك أولًا، ثم عد لإتمام الطلب.</p>
        <Link href="/products" className="vp-btn vp-btn--ink">
          <span>تسوّق العطور</span>
          <Icon name="arrow" size={18} />
        </Link>
      </div>
    );
  }

  const zoneFee = zones.find((z) => z.id === zoneId)?.fee;
  const subtotal = quote?.subtotal ?? items.reduce((s, i) => s + i.price * i.quantity, 0);
  const fee = zoneId ? (quote?.delivery_fee ?? zoneFee ?? 0) : null;
  const discount = quote?.discount ?? 0;
  const giftFee = quote?.gift_wrap_fee ?? 0;
  const total = quote && zoneId ? quote.total : subtotal - discount + (fee ?? 0) + giftFee;
  const unavailable = new Set(quote?.items.filter((l) => !l.available).map((l) => l.variant_id) ?? []);
  if (badVariant) unavailable.add(badVariant);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="vp-co" noValidate>
      <div className="vp-co__main">
        <fieldset className="vp-co__block">
          <legend>
            <span dir="ltr">01</span> بيانات المستلم
          </legend>
          <Field id="co-name" label="الاسم الكامل" error={errors.customer_name?.message}>
            <input id="co-name" {...register('customer_name')} autoComplete="name" aria-invalid={!!errors.customer_name} />
          </Field>
          <div className="vp-co__two">
            <Field id="co-phone" label="رقم الهاتف" error={errors.phone?.message}>
              <input id="co-phone" {...register('phone')} inputMode="tel" dir="ltr" placeholder="09XXXXXXXX" autoComplete="tel" aria-invalid={!!errors.phone} />
            </Field>
            <Field id="co-wa" label="رقم واتساب (اختياري)" error={errors.whatsapp?.message}>
              <input id="co-wa" {...register('whatsapp')} inputMode="tel" dir="ltr" placeholder="09XXXXXXXX" aria-invalid={!!errors.whatsapp} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="vp-co__block">
          <legend>
            <span dir="ltr">02</span> التوصيل إلى المنزل
          </legend>
          <Field id="co-zone" label="المدينة / منطقة التوصيل" error={errors.delivery_zone_id?.message}>
            <select id="co-zone" {...register('delivery_zone_id')} aria-invalid={!!errors.delivery_zone_id}>
              <option value="">اختر منطقتك…</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name === z.city ? z.name : `${z.name}`} — {formatPrice(z.fee)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="co-address" label="العنوان التفصيلي" error={errors.address?.message}>
            <textarea id="co-address" {...register('address')} rows={2} placeholder="الحي، الشارع، أقرب نقطة دالة…" autoComplete="street-address" aria-invalid={!!errors.address} />
          </Field>
          <Field id="co-note" label="ملاحظة للمندوب (اختياري)" error={errors.delivery_note?.message}>
            <input id="co-note" {...register('delivery_note')} />
          </Field>
        </fieldset>

        {giftWrapEnabled && quote?.gift_wrap_available !== false && (
          <fieldset className="vp-co__block">
            <legend>
              <span dir="ltr">·</span> تغليف هدية
            </legend>
            <label className="vp-check">
              <input type="checkbox" {...register('gift_wrap')} />
              <span>
                <Icon name="gift" size={16} /> غلّف طلبي كهدية
                {quote?.gift_wrap_fee ? ` (+${formatPrice(quote.gift_wrap_fee)})` : ''}
              </span>
            </label>
            {giftWrap && (
              <Field id="co-gift" label="رسالة البطاقة (اختياري)" error={errors.gift_message?.message}>
                <input id="co-gift" {...register('gift_message')} maxLength={300} />
              </Field>
            )}
          </fieldset>
        )}

        <fieldset className="vp-co__block">
          <legend>
            <span dir="ltr">03</span> طريقة الدفع
          </legend>
          <div className="vp-co__pay" role="radiogroup" aria-label="طريقة الدفع">
            <div role="radio" aria-checked="true" className="is-active">
              <Icon name="cash" size={22} />
              <div>
                <b>الدفع عند الاستلام</b>
                <p>ادفع نقدًا للمندوب عند وصول طلبك.</p>
              </div>
            </div>
          </div>
        </fieldset>
      </div>

      <aside className="vp-co__sum" aria-label="ملخص الطلب">
        <h2>ملخص الطلب</h2>
        <ul className="vp-co__lines">
          {items.map((it) => (
            <li key={it.variantId} className={unavailable.has(it.variantId) ? 'is-bad' : ''}>
              {it.image ? (
                <Photo src={it.image} alt="" width={48} height={64} sizes="48px" />
              ) : (
                <span className="vp-co__ph" />
              )}
              <span>
                <b>{it.name}</b>
                <small>
                  {it.size} {unitAr(it.unit)} × {it.quantity}
                </small>
                {unavailable.has(it.variantId) && (
                  <em role="alert">غير متوفر بهذه الكمية — عدّل السلة</em>
                )}
              </span>
              <span className="vp-co__lp">{formatPrice(it.price * it.quantity)}</span>
            </li>
          ))}
        </ul>
        <Link href="/cart" className="vp-link vp-co__edit">
          تعديل السلة
        </Link>

        <div className="vp-co__coupon">
          <label htmlFor="co-coupon" className="vp-sr">
            كوبون الخصم
          </label>
          <input id="co-coupon" {...register('coupon_code')} placeholder="كوبون الخصم" dir="ltr" autoComplete="off" />
          <button type="button" onClick={applyCoupon} className="vp-btn vp-btn--ghost-ink">
            <span>تطبيق</span>
          </button>
        </div>
        {couponMsg && <p className={`vp-form-msg${couponMsg.ok ? ' is-ok' : ''}`}>{couponMsg.text}</p>}

        <dl className="vp-co__totals" aria-busy={quoting}>
          <div>
            <dt>المجموع الفرعي</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          {discount > 0 && (
            <div className="is-ok">
              <dt>الخصم{appliedCoupon ? ` (${appliedCoupon})` : ''}</dt>
              <dd>− {formatPrice(discount)}</dd>
            </div>
          )}
          <div>
            <dt>التوصيل</dt>
            <dd>{fee == null ? 'اختر منطقتك' : formatPrice(fee)}</dd>
          </div>
          {giftFee > 0 && (
            <div>
              <dt>تغليف الهدية</dt>
              <dd>{formatPrice(giftFee)}</dd>
            </div>
          )}
          <div className="vp-co__total">
            <dt>الإجمالي</dt>
            <dd>{formatPrice(total)}</dd>
          </div>
        </dl>

        {serverError && (
          <p className="vp-form-msg" role="alert">
            {serverError}
          </p>
        )}
        <button type="submit" disabled={submitting || unavailable.size > 0} className="vp-btn vp-btn--gold vp-btn--block vp-btn--xl">
          <span>{submitting ? 'جارٍ تأكيد الطلب…' : 'تأكيد الطلب'}</span>
          {!submitting && <Icon name="arrow" size={18} />}
        </button>
        <p className="vp-co__assure">
          <Icon name="truck" size={14} /> لا دفع الآن — تدفع عند الاستلام. سنتواصل معك لتأكيد الطلب.
        </p>
      </aside>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className={`vp-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <span className="vp-field__err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
