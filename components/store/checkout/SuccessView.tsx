'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatPrice } from '@/lib/utils/money';
import { whatsappUrl } from '@/lib/utils/format';
import { ORDER_STATUS_LABELS_AR } from '@/config/constants';
import { Icon } from '@/components/store/ui';
import type { OrderPublic } from '@/types';
import { Photo } from '@/components/store/photo';

/** Order confirmation — the final frame. Data is the server's own response. */
export function SuccessView({ whatsapp }: { whatsapp: string }) {
  const [order, setOrder] = useState<OrderPublic | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('velmor-last-order');
      if (raw) setOrder(JSON.parse(raw) as OrderPublic);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  if (!ready) return <div className="vp-page vp-page--ink" aria-busy="true" />;

  if (!order) {
    return (
      <div className="vp-page vp-page--ink">
        <div className="vp-wrap vp-empty">
          <span className="vp-script" aria-hidden="true">
            thank you
          </span>
          <h1>لا يوجد طلب لعرضه هنا</h1>
          <p>لمتابعة طلب سابق استخدم رقم الطلب ورقم هاتفك.</p>
          <Link href="/track-order" className="vp-btn vp-btn--gold">
            <span>تتبّع الطلب</span>
            <Icon name="arrow" size={18} />
          </Link>
        </div>
      </div>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(order!.order_number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard refused — number stays selectable */
    }
  }

  return (
    <div className="vp-page vp-page--ink vp-success">
      <div className="vp-wrap vp-success__grid">
        <div className="vp-success__hero">
          <span className="vp-script vp-success__script" aria-hidden="true">
            merci
          </span>
          <p className="vp-eyebrow vp-eyebrow--gold">تم استلام طلبك</p>
          <h1>حضورك في الطريق إليك.</h1>
          <p className="vp-success__lead">سنتواصل معك قريبًا لتأكيد الطلب. الدفع عند الاستلام — لا شيء تدفعه الآن.</p>
          <div className="vp-success__num">
            <span>رقم الطلب</span>
            <b dir="ltr">{order.order_number}</b>
            <button type="button" onClick={copy} aria-label="نسخ رقم الطلب">
              <Icon name={copied ? 'check' : 'plus'} size={16} />
              <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
            </button>
          </div>
          <p className="vp-success__status">
            الحالة: <b>{ORDER_STATUS_LABELS_AR[order.status]}</b>
          </p>
          <div className="vp-success__ctas">
            <Link href={`/track-order?order=${encodeURIComponent(order.order_number)}`} className="vp-btn vp-btn--gold">
              <span>تتبّع الطلب</span>
              <Icon name="arrow" size={18} />
            </Link>
            <a
              className="vp-btn vp-btn--ghost"
              href={whatsappUrl(whatsapp, `مرحبًا VELMOR، طلبي رقم ${order.order_number}.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="whatsapp" size={18} />
              <span>تواصل عبر واتساب</span>
            </a>
          </div>
        </div>
        <aside className="vp-success__sum" aria-label="ملخص الطلب">
          <ul>
            {order.items.map((it, i) => (
              <li key={i}>
                {it.image ? (
                  <Photo src={it.image} alt="" width={52} height={70} sizes="52px" />
                ) : (
                  <span className="vp-co__ph" />
                )}
                <span>
                  <b>{it.name}</b>
                  <small>
                    {it.variant} × {it.quantity}
                  </small>
                </span>
                <em>{formatPrice(it.line_total)}</em>
              </li>
            ))}
          </ul>
          <dl className="vp-co__totals">
            <div>
              <dt>المجموع الفرعي</dt>
              <dd>{formatPrice(order.subtotal)}</dd>
            </div>
            {Number(order.discount_total) > 0 && (
              <div className="is-ok">
                <dt>الخصم</dt>
                <dd>− {formatPrice(order.discount_total)}</dd>
              </div>
            )}
            <div>
              <dt>التوصيل{order.delivery.zone ? ` — ${order.delivery.zone}` : ''}</dt>
              <dd>{formatPrice(order.delivery_fee)}</dd>
            </div>
            {Number(order.gift_wrap_fee ?? 0) > 0 && (
              <div>
                <dt>تغليف الهدية</dt>
                <dd>{formatPrice(order.gift_wrap_fee!)}</dd>
              </div>
            )}
            <div className="vp-co__total">
              <dt>الإجمالي عند الاستلام</dt>
              <dd>{formatPrice(order.total)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
