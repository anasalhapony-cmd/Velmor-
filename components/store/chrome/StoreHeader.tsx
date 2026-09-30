'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCart } from '@/stores/cart-store';
import { useWishlist } from '@/stores/wishlist-store';
import { Icon } from '@/components/store/ui';
import { formatPrice } from '@/lib/utils/money';
import { Photo } from '@/components/store/photo';

const NAV = [
  { href: '/products', label: 'العطور' },
  { href: '/#families', label: 'العائلات' },
  { href: '/#signature', label: 'التوقيع' },
  { href: '/finder', label: 'المستشار' },
];

const MENU: [string, string, string][] = [
  ['/products', 'كل العطور', 'Collection'],
  ['/finder', 'مستشار العطور', 'Finder'],
  ['/products?gender=MEN', 'رجالية', 'Men'],
  ['/track-order', 'تتبّع الطلب', 'Orders'],
  ['/faq', 'الأسئلة الشائعة', 'FAQ'],
];

type SearchHit = { id: string; slug: string; name: string; name_ar: string | null; min_price: number | null; image: string | null };

export function StoreHeader({
  announcement,
  menuImage,
  deliveryLine = 'توصيل داخل بنغازي',
}: {
  announcement?: string | null;
  menuImage?: string | null;
  deliveryLine?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const cartCount = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const openCart = useCart((s) => s.open);
  const wishCount = useWishlist((s) => s.ids.size);
  const closeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);
  // Close overlays on navigation.
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen || searchOpen ? 'hidden' : '';
    if (menuOpen) closeRef.current?.focus({ preventScroll: true });
    if (searchOpen) window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen, searchOpen]);

  // Live search (debounced, server-side search_products RPC).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { results?: SearchHit[] };
        setHits(data.results ?? []);
      } catch {
        /* aborted / offline */
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <>
      <header className="vp-header" data-header>
        {announcement ? <p className="vp-header__ann">{announcement}</p> : null}
        <Link href="/" className="vp-header__logo" aria-label="VELMOR — الرئيسية">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/brand/logo-white.webp" alt="VELMOR" width={122} height={53} />
        </Link>
        <nav className="vp-header__nav" aria-label="التنقل الرئيسي">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="vp-link" aria-current={pathname === n.href ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="vp-header__actions">
          <button type="button" className="vp-iconbtn" aria-label="بحث" onClick={() => setSearchOpen(true)}>
            <Icon name="search" />
          </button>
          <Link href="/wishlist" className="vp-iconbtn" aria-label={`المفضلة${mounted && wishCount ? ` (${wishCount})` : ''}`}>
            <Icon name="heart" />
            {mounted && wishCount > 0 && <span className="vp-bagcount vp-bagcount--soft">{wishCount}</span>}
          </Link>
          <button type="button" className="vp-iconbtn vp-iconbtn--bag" aria-label={`السلة (${mounted ? cartCount : 0})`} onClick={openCart}>
            <Icon name="bag" />
            <span className="vp-bagcount" key={mounted ? cartCount : 0} data-bump={mounted && cartCount > 0 ? '' : undefined}>
              {mounted ? cartCount : 0}
            </span>
          </button>
          <button
            ref={menuBtnRef}
            type="button"
            className="vp-menubtn"
            aria-expanded={menuOpen}
            aria-controls="vp-menu"
            onClick={() => setMenuOpen(true)}
          >
            <span>القائمة</span>
            <Icon name="menu" />
          </button>
        </div>
      </header>

      <div
        className="vp-menu"
        id="vp-menu"
        data-menu
        data-open={menuOpen ? '' : undefined}
        aria-hidden={!menuOpen}
        role="dialog"
        aria-modal="true"
        aria-label="القائمة"
      >
        <div className="vp-menu__panel">
          <button
            ref={closeRef}
            type="button"
            className="vp-menu__close"
            aria-label="إغلاق القائمة"
            onClick={() => {
              setMenuOpen(false);
              menuBtnRef.current?.focus();
            }}
            tabIndex={menuOpen ? 0 : -1}
          >
            <Icon name="close" size={26} />
          </button>
          <ol className="vp-menu__list">
            {MENU.map(([href, ar, en], i) => (
              <li key={href} style={{ ['--i' as string]: i }}>
                <Link href={href} data-transition tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}>
                  <span className="vp-menu__num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="vp-menu__ar">{ar}</span>
                  <span className="vp-menu__en">{en}</span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="vp-menu__aside">
            {menuImage ? (
              <Photo src={menuImage} alt="" width={380} height={514} sizes="350px" />
            ) : null}
            <p>الدفع عند الاستلام · {deliveryLine}</p>
          </div>
        </div>
      </div>

      <div
        className="vp-search"
        data-open={searchOpen ? '' : undefined}
        aria-hidden={!searchOpen}
        role="dialog"
        aria-modal="true"
        aria-label="البحث"
      >
        <button type="button" className="vp-menu__close" aria-label="إغلاق البحث" onClick={() => setSearchOpen(false)} tabIndex={searchOpen ? 0 : -1}>
          <Icon name="close" size={26} />
        </button>
        <form className="vp-search__form" role="search" onSubmit={submitSearch}>
          <label htmlFor="vp-search-input" className="vp-eyebrow vp-eyebrow--gold">
            ابحث عن عطر، عائلة، أو مكوّن
          </label>
          <div className="vp-search__row">
            <input
              ref={searchRef}
              id="vp-search-input"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="عود، برغموت، NOIR…"
              autoComplete="off"
              tabIndex={searchOpen ? 0 : -1}
            />
            <button type="submit" className="vp-btn vp-btn--gold" tabIndex={searchOpen ? 0 : -1}>
              <span>بحث</span>
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </form>
        <ul className="vp-search__hits" aria-live="polite" aria-busy={searching}>
          {hits.map((h) => (
            <li key={h.id}>
              <Link href={`/products/${h.slug}`} tabIndex={searchOpen ? 0 : -1}>
                {h.image ? (
                  <Photo src={h.image} alt="" width={56} height={76} sizes="56px" />
                ) : (
                  <span className="vp-search__ph" />
                )}
                <span>
                  <b>{h.name_ar || h.name}</b>
                  <small dir="ltr">{h.name}</small>
                </span>
                {h.min_price != null && <em>{formatPrice(Number(h.min_price))}</em>}
              </Link>
            </li>
          ))}
          {q.trim().length >= 2 && !searching && hits.length === 0 && <li className="vp-search__empty">لا نتائج مطابقة — جرّب كلمة أخرى.</li>}
        </ul>
      </div>
    </>
  );
}
