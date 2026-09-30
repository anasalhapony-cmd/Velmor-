'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/stores/cart-store';
import { useCartValidation } from '@/components/store/commerce/useCartValidation';
import { trackEvent } from '@/lib/analytics/client';
import { formatPrice } from '@/lib/utils/money';
import { Icon } from '@/components/store/ui';
import { unitAr } from '@/components/store/commerce/AddToBag';
import { MAX_QTY_PER_LINE } from '@/config/constants';
import { Photo } from '@/components/store/photo';

export function CartDrawer() {
  const items = useCart((s) => s.items);
  const isOpen = useCart((s) => s.isOpen);
  const close = useCart((s) => s.close);
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { quote, unavailable, loading } = useCartValidation(isOpen);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.setAttribute('data-drawer-open', '');
      window.setTimeout(() => panelRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = '';
      document.body.removeAttribute('data-drawer-open');
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, mounted, close]);

  if (!mounted) return null;

  const count = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = quote?.subtotal ?? items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div className="vp-drawer" data-open={isOpen ? '' : undefined} aria-hidden={!isOpen}>
      <button type="button" className="vp-drawer__scrim" aria-label="إغلاق السلة" onClick={close} tabIndex={-1} />
      <div className="vp-drawer__panel" role="dialog" aria-modal="true" aria-label="سلة التسوق" ref={panelRef} tabIndex={-1}>
        <header className="vp-drawer__head">
          <h2>
            السلة <sup>{count}</sup>
          </h2>
          <button type="button" className="vp-iconbtn" onClick={close} aria-label="إغلاق" tabIndex={isOpen ? 0 : -1}>
            <Icon name="close" />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="vp-drawer__empty">
            <span className="vp-script">empty</span>
            <p>سلتك فارغة. عطرك التالي بانتظارك.</p>
            <Link href="/products" onClick={close} className="vp-btn vp-btn--gold" tabIndex={isOpen ? 0 : -1}>
              <span>تسوّق العطور</span>
              <Icon name="arrow" size={18} />
            </Link>
          </div>
        ) : (
          <>
            <ul className="vp-drawer__lines">
              {items.map((it) => {
                const bad = unavailable.has(it.variantId);
                return (
                  <li key={it.variantId} className={bad ? 'is-bad' : ''}>
                    <Link href={`/products/${it.slug}`} onClick={close} className="vp-drawer__img" tabIndex={-1}>
                      {it.image ? (
                        <Photo src={it.image} alt="" width={72} height={96} sizes="72px" />
                      ) : null}
                    </Link>
                    <div className="vp-drawer__meta">
                      <Link href={`/products/${it.slug}`} onClick={close} tabIndex={isOpen ? 0 : -1}>
                        {it.name}
                      </Link>
                      <small>
                        {it.size} {unitAr(it.unit)}
                      </small>
                      {bad && (
                        <em role="alert">
                          <Icon name="alert" size={14} /> غير متوفر بهذه الكمية
                        </em>
                      )}
                      <div className="vp-qty" role="group" aria-label={`كمية ${it.name}`}>
                        <button
                          type="button"
                          aria-label="إنقاص"
                          tabIndex={isOpen ? 0 : -1}
                          onClick={() => setQuantity(it.variantId, it.quantity - 1)}
                        >
                          <Icon name="minus" size={14} />
                        </button>
                        <span aria-live="polite">{it.quantity}</span>
                        <button
                          type="button"
                          aria-label="زيادة"
                          tabIndex={isOpen ? 0 : -1}
                          disabled={it.quantity >= MAX_QTY_PER_LINE}
                          onClick={() => setQuantity(it.variantId, it.quantity + 1)}
                        >
                          <Icon name="plus" size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="vp-drawer__end">
                      <b>{formatPrice(it.price * it.quantity)}</b>
                      <button
                        type="button"
                        className="vp-drawer__remove"
                        aria-label={`حذف ${it.name}`}
                        tabIndex={isOpen ? 0 : -1}
                        onClick={() => {
                          trackEvent('remove_from_cart', { productId: it.productId, meta: { variant: it.variantId } });
                          remove(it.variantId);
                        }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <footer className="vp-drawer__foot">
              <div className="vp-drawer__sum">
                <span>المجموع الفرعي</span>
                <b aria-busy={loading}>{formatPrice(subtotal)}</b>
              </div>
              <p>رسوم التوصيل تُحسب حسب منطقتك عند إتمام الطلب. الدفع عند الاستلام.</p>
              <Link
                href="/checkout"
                onClick={close}
                className={`vp-btn vp-btn--gold vp-btn--block${unavailable.size ? ' is-disabled' : ''}`}
                aria-disabled={unavailable.size > 0}
                tabIndex={isOpen ? 0 : -1}
              >
                <span>إتمام الطلب</span>
                <Icon name="arrow" size={18} />
              </Link>
              <Link href="/cart" onClick={close} className="vp-link vp-drawer__view" tabIndex={isOpen ? 0 : -1}>
                عرض السلة كاملة
              </Link>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
