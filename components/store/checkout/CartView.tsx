'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/stores/cart-store';
import { useCartValidation } from '@/components/store/commerce/useCartValidation';
import { trackEvent } from '@/lib/analytics/client';
import { formatPrice } from '@/lib/utils/money';
import { Icon } from '@/components/store/ui';
import { unitAr } from '@/components/store/commerce/AddToBag';
import { MAX_QTY_PER_LINE } from '@/config/constants';
import { Photo } from '@/components/store/photo';

export function CartView() {
  const items = useCart((s) => s.items);
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { quote, unavailable, loading } = useCartValidation(mounted);

  if (!mounted) return <div className="vp-page vp-page--paper" aria-busy="true" />;

  if (items.length === 0) {
    return (
      <div className="vp-page vp-page--paper">
        <div className="vp-wrap vp-empty vp-empty--light">
          <span className="vp-script" aria-hidden="true">
            empty
          </span>
          <h1>سلتك فارغة</h1>
          <p>عطرك التالي بانتظارك — أو دع مستشار العطور يختار لك.</p>
          <div className="vp-empty__ctas">
            <Link href="/products" className="vp-btn vp-btn--ink" data-transition>
              <span>تسوّق العطور</span>
              <Icon name="arrow" size={18} />
            </Link>
            <Link href="/finder" className="vp-link vp-link--ink" data-transition>
              مستشار العطور
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const subtotal = quote?.subtotal ?? items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div className="vp-page vp-page--paper">
      <header className="vp-page__head vp-wrap">
        <p className="vp-eyebrow">السلة</p>
        <h1 className="vp-page__title">
          اختياراتك <sup dir="ltr">{items.reduce((n, i) => n + i.quantity, 0)}</sup>
        </h1>
      </header>
      <div className="vp-wrap vp-cart">
        <ul className="vp-cart__lines">
          {items.map((it) => {
            const bad = unavailable.has(it.variantId);
            return (
              <li key={it.variantId} className={bad ? 'is-bad' : ''}>
                <Link href={`/products/${it.slug}`} className="vp-cart__img" tabIndex={-1}>
                  {it.image ? (
                    <Photo src={it.image} alt="" width={120} height={160} sizes="120px" />
                  ) : null}
                </Link>
                <div className="vp-cart__meta">
                  <Link href={`/products/${it.slug}`}>{it.name}</Link>
                  <small>
                    {it.size} {unitAr(it.unit)} · {formatPrice(it.price)}
                  </small>
                  {bad && (
                    <em role="alert">
                      <Icon name="alert" size={14} /> غير متوفر بهذه الكمية — قلّل الكمية أو احذفه
                    </em>
                  )}
                  <div className="vp-qty" role="group" aria-label={`كمية ${it.name}`}>
                    <button type="button" aria-label="إنقاص" onClick={() => setQuantity(it.variantId, it.quantity - 1)}>
                      <Icon name="minus" size={14} />
                    </button>
                    <span aria-live="polite">{it.quantity}</span>
                    <button type="button" aria-label="زيادة" disabled={it.quantity >= MAX_QTY_PER_LINE} onClick={() => setQuantity(it.variantId, it.quantity + 1)}>
                      <Icon name="plus" size={14} />
                    </button>
                  </div>
                </div>
                <div className="vp-cart__end">
                  <b>{formatPrice(it.price * it.quantity)}</b>
                  <button
                    type="button"
                    className="vp-drawer__remove"
                    aria-label={`حذف ${it.name}`}
                    onClick={() => {
                      trackEvent('remove_from_cart', { productId: it.productId, meta: { variant: it.variantId } });
                      remove(it.variantId);
                    }}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <aside className="vp-co__sum" aria-label="ملخص السلة">
          <h2>الملخص</h2>
          <dl className="vp-co__totals" aria-busy={loading}>
            <div>
              <dt>المجموع الفرعي</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div>
              <dt>التوصيل</dt>
              <dd>يُحسب حسب منطقتك</dd>
            </div>
          </dl>
          <Link
            href="/checkout"
            className={`vp-btn vp-btn--gold vp-btn--block vp-btn--xl${unavailable.size ? ' is-disabled' : ''}`}
            aria-disabled={unavailable.size > 0}
          >
            <span>إتمام الطلب</span>
            <Icon name="arrow" size={18} />
          </Link>
          <p className="vp-co__assure">
            <Icon name="cash" size={14} /> الدفع عند الاستلام · الأسعار تُعتمد من الخادم عند التأكيد
          </p>
        </aside>
      </div>
    </div>
  );
}
