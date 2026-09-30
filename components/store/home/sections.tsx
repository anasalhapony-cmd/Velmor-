/**
 * Homepage narrative — the approved "حملة الحضور" design, now fed by real data:
 * products/variants/notes from Postgres, copy from cms_blocks (with the
 * approved copy as fallback), order/visibility from homepage_sections.
 * Server components; interactive pieces are small client islands.
 */
import Link from 'next/link';
import type { CmsBlockRow } from '@/types/database';
import type { ProductDetail, NoteRef } from '@/types';
import { OCCASION_LABELS_AR, SEASON_LABELS_AR, CONCENTRATION_LABELS_AR } from '@/config/constants';
import { formatPrice } from '@/lib/utils/money';
import { whatsappUrl } from '@/lib/utils/format';
import { AddToBag } from '@/components/store/commerce/AddToBag';
import { Icon, Letters, Pips, PriceTag, Words, cv } from '@/components/store/ui';
import { Photo } from '@/components/store/photo';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
type Cfg = Record<string, unknown>;
export function cfgOf(b: CmsBlockRow | undefined | null): Cfg {
  return b && b.config && typeof b.config === 'object' && !Array.isArray(b.config) ? (b.config as Cfg) : {};
}
const strArr = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length ? (v as string[]) : null;

/** "VELMOR NOIR" -> "NOIR": the word that becomes a typographic object. */
export function shortName(p: Pick<ProductDetail, 'name'>): string {
  const s = p.name.replace(/^VELMOR\s+/i, '').trim();
  return (s || p.name).split(/\s+/)[0]!;
}
export function displayName(p: Pick<ProductDetail, 'name' | 'nameAr'>): string {
  return p.nameAr || p.name;
}
function firstAvailable(p: ProductDetail) {
  return p.variants.find((v) => v.stockLevel !== 'OUT_OF_STOCK') ?? p.variants[0];
}
function heroImage(p: ProductDetail | undefined): string | null {
  return p?.images[0]?.url ?? null;
}
const COUNT_WORDS: Record<number, string> = {
  1: 'توقيعٌ واحد',
  2: 'توقيعان',
  3: 'ثلاثة توقيعات',
  4: 'أربعة توقيعات',
  5: 'خمسة توقيعات',
  6: 'ستة توقيعات',
  7: 'سبعة توقيعات',
  8: 'ثمانية توقيعات',
  9: 'تسعة توقيعات',
  10: 'عشرة توقيعات',
};

// ---------------------------------------------------------------------------
// 01 — Hero (pinned; --p scroll progress)
// ---------------------------------------------------------------------------
export function HeroSection({ block, fallbackImage }: { block?: CmsBlockRow; fallbackImage: string | null }) {
  const c = cfgOf(block);
  const title = block?.title?.trim() || 'حضورٌ لا يُشرَح.';
  const [l1, ...rest] = title.includes('|') ? title.split('|') : title.split(/\s+/);
  const l2 = title.includes('|') ? rest.join(' ') : rest.join(' ');
  const image = block?.image_url || fallbackImage || '/images/brand/hero-bottle.webp';
  const second = typeof c.second === 'string' ? c.second : 'يُشَمّ.';
  const script = typeof c.script === 'string' ? c.script : 'Presence';
  return (
    <section className="vp-hero" id="top" data-scene aria-labelledby="vp-hero-title">
      <div className="vp-hero__sticky">
        <div className="vp-hero__bg" aria-hidden="true" />
        <div className="vp-hero__grain" aria-hidden="true" />
        <div className="vp-hero__word" aria-hidden="true">
          <Letters text="VELMOR" />
        </div>
        <div className="vp-hero__bottle" aria-hidden="true">
          <div className="vp-hero__bottle-mouse">
            <Photo src={image} alt="" width={1035} height={1400} sizes="(max-width: 899px) 340px, 30vw" priority />
            <span className="vp-hero__shadow" />
          </div>
        </div>
        <div className="vp-hero__copy">
          <p className="vp-eyebrow vp-hero__eyebrow" data-reveal="mask">
            {block?.subtitle || 'عطور ليبية لجيلٍ جديد من الرجال'}
          </p>
          <h1 className="vp-hero__title" id="vp-hero-title">
            <span className="vp-line" data-reveal="mask" data-delay="120">
              <span>{l1}</span>
            </span>
            {l2 ? (
              <span className="vp-line" data-reveal="mask" data-delay="240">
                <span>{l2}</span>
              </span>
            ) : null}
          </h1>
          <p className="vp-hero__sub" data-reveal="up" data-delay="480">
            {block?.body || 'مجموعة VELMOR للرجال — توازنٌ بين الفخامة والجرأة.'}
          </p>
          <div className="vp-hero__ctas" data-reveal="up" data-delay="600">
            <Link href={block?.cta_href || '/products'} className="vp-btn vp-btn--gold" data-magnetic data-transition>
              <span>{block?.cta_label || 'اكتشف العطور'}</span>
              <Icon name="arrow" size={18} />
            </Link>
            <Link href="/finder" className="vp-btn vp-btn--ghost" data-magnetic data-transition>
              <span>مستشار العطور</span>
            </Link>
          </div>
        </div>
        <div className="vp-hero__second" aria-hidden="true">
          <span className="vp-script vp-hero__script">{script}</span>
          <span className="vp-hero__second-ar">{second}</span>
        </div>
        <div className="vp-hero__meta">
          <span dir="ltr">ELEGANCE WITH ATTITUDE</span>
          <span className="vp-hero__cue">
            <i />
            مرّر للاكتشاف
          </span>
          {/* Approved art direction: the founding year as a Roman numeral (brand launch 2026). */}
          <span>
            ليبيا · <span dir="ltr">MMXXVI</span>
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Marquee (scroll-velocity skew)
// ---------------------------------------------------------------------------
export function MarqueeSection({ block, announcement }: { block?: CmsBlockRow; announcement?: string | null }) {
  const items = strArr(cfgOf(block).items) ?? [
    'أناقة بحضور',
    'Elegance with attitude',
    'عطور تُعبّر عنك',
    'VELMOR Perfumes',
    'ثقة · أسلوب · حضور',
  ];
  const all = announcement ? [announcement, ...items] : items;
  const run = (hidden: boolean) => (
    <div className="vp-marquee__run" aria-hidden={hidden || undefined}>
      {all.map((t, i) => (
        <span key={i} className={/[a-z]/i.test(t) && !/[؀-ۿ]/.test(t) ? 'is-latin' : ''}>
          {t}
          <i className="vp-diamond" />
        </span>
      ))}
    </div>
  );
  return (
    <div className="vp-marquee" data-marquee role="marquee" aria-label={all.join(' · ')}>
      <div className="vp-marquee__track">
        {run(true)}
        {run(true)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 02 — Brand statement (paper)
// ---------------------------------------------------------------------------
const PERSONALITY = [
  { ar: 'أنيق', en: 'Elegant' },
  { ar: 'جريء', en: 'Bold' },
  { ar: 'شاب', en: 'Youthful' },
  { ar: 'راقٍ', en: 'Refined' },
  { ar: 'عصري', en: 'Modern' },
  { ar: 'حصري', en: 'Exclusive' },
];
export function StatementSection({ block }: { block?: CmsBlockRow }) {
  const body =
    block?.body ||
    'وُلدت VELMOR في ليبيا لجيلٍ جديد من الرجال يهتمّون بالحضور والثقة والمظهر. أناقةٌ بطابعٍ خاص — توازنٌ بين الفخامة والرجولة وثقافة الشارع.';
  const script = block?.title && /^[A-Za-z\s]+$/.test(block.title) ? block.title : 'fancy';
  return (
    <section className="vp-statement" aria-labelledby="vp-statement-title">
      <div className="vp-wrap vp-statement__grid">
        <div className="vp-statement__side">
          <p className="vp-eyebrow" data-reveal="mask">
            {block?.subtitle || 'البيان'}
          </p>
          <div className="vp-statement__fancy" data-reveal="fade">
            <span className="vp-script" data-parallax="-0.08" aria-hidden="true">
              {script}
            </span>
            <small>مستوحاة من المعنى الفرنسي للأناقة</small>
          </div>
        </div>
        <h2 id="vp-statement-title" className="vp-statement__text" data-words-scroll>
          <Words text={body} />
        </h2>
      </div>
      <ul className="vp-wrap vp-traits" data-stagger>
        {PERSONALITY.map((t) => (
          <li key={t.en} data-reveal="up">
            <b>{t.ar}</b>
            <span dir="ltr">{t.en}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 03 — Collection rail (pinned horizontal on desktop, swipe on touch)
// ---------------------------------------------------------------------------
function RailCard({ p, index }: { p: ProductDetail; index: number }) {
  const v = firstAvailable(p);
  const notes = [...p.notes.top, ...p.notes.heart, ...p.notes.base].slice(0, 5);
  const img = heroImage(p);
  const name = displayName(p);
  return (
    <article className={`vp-rcard vp-field--${p.artField}`} data-cursor="اكتشف" data-rail-item>
      <Link href={`/products/${p.slug}`} className="vp-rcard__link" data-transition aria-label={name} />
      <header className="vp-rcard__top">
        <span className="vp-rcard__num" dir="ltr">
          N° {String(index + 1).padStart(2, '0')}
        </span>
        <span className="vp-rcard__fam">{p.familyName ?? ''}</span>
      </header>
      <div className="vp-rcard__stage">
        <span className="vp-rcard__word" dir="ltr" aria-hidden="true">
          {shortName(p)}
        </span>
        {img ? (
          <Photo className="vp-rcard__img" src={img} alt={name} width={700} height={940} sizes="290px" />
        ) : null}
      </div>
      <footer className="vp-rcard__body">
        <div className="vp-rcard__names">
          <h3>{name}</h3>
          <span dir="ltr">
            {p.name}
            {p.concentration ? ` · ${CONCENTRATION_LABELS_AR[p.concentration]}` : ''}
          </span>
        </div>
        <div className="vp-rcard__price">
          <PriceTag price={v?.price ?? null} compareAt={v?.compareAtPrice} />
        </div>
        <div className="vp-rcard__reveal">
          <div>
            {p.shortDescription && <p>{p.shortDescription}</p>}
            {notes.length > 0 && (
              <ul>
                {notes.map((n) => (
                  <li key={n.slug}>{n.name}</li>
                ))}
              </ul>
            )}
            <AddToBag product={{ id: p.id, slug: p.slug, name, image: img }} variant={v} />
          </div>
        </div>
      </footer>
    </article>
  );
}

export function RailSection({
  block,
  products,
  anchor = 'collection',
}: {
  block?: CmsBlockRow;
  products: ProductDetail[];
  anchor?: string;
}) {
  if (products.length === 0) return null;
  const n = products.length;
  const woody = products.find((p) => p.familySlug === 'woody');
  const fresh = products.find((p) => p.familySlug === 'fresh' || p.familySlug === 'citrus');
  const lead =
    block?.body ||
    (woody && fresh
      ? `من خشب ${shortName(woody)} الداكن إلى انتعاش ${shortName(fresh)} — اختر العطر الذي يدخل الغرفة قبلك.`
      : 'اختر العطر الذي يدخل الغرفة قبلك.');
  const t1 = block?.title || `${COUNT_WORDS[n] ?? `${n} توقيعًا`}.`;
  const t2 = block?.subtitle || 'لكلٍّ منها حضور.';
  return (
    <section className="vp-rail" id={anchor} data-hrail aria-labelledby={`${anchor}-title`}>
      <div className="vp-rail__sticky">
        <div className="vp-rail__head">
          <p className="vp-eyebrow vp-eyebrow--gold">المجموعة</p>
          <div className="vp-rail__progress" aria-hidden="true">
            <span className="vp-rail__count" dir="ltr">
              <b data-rail-index>01</b> / {String(n).padStart(2, '0')}
            </span>
            <span className="vp-rail__bar">
              <i />
            </span>
          </div>
        </div>
        <div className="vp-rail__track" data-hrail-track>
          <div className="vp-rail__intro">
            <h2 id={`${anchor}-title`} className="vp-h2">
              {t1}
              <br />
              <em>{t2}</em>
            </h2>
            <p>{lead}</p>
            <span className="vp-rail__hint" aria-hidden="true">
              <Icon name="arrow" size={18} /> مرّر
            </span>
          </div>
          {products.map((p, i) => (
            <RailCard key={p.id} p={p} index={i} />
          ))}
          <Link href="/products" className="vp-rail__end" data-transition data-cursor="عرض الكل">
            <span className="vp-script" aria-hidden="true">
              all
            </span>
            <b>كل العطور</b>
            <Icon name="arrow" size={28} />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 04 — Fragrance world (families)
// ---------------------------------------------------------------------------
export interface FamilyFacet {
  slug: string;
  name: string;
  name_en?: string | null;
  description?: string | null;
  count?: number;
}
export function FamiliesSection({
  block,
  families,
  products,
}: {
  block?: CmsBlockRow;
  families: FamilyFacet[];
  products: ProductDetail[];
}) {
  if (families.length === 0) return null;
  return (
    <section className="vp-families" id="families" data-families aria-labelledby="vp-fam-title">
      <div className="vp-wrap">
        <div className="vp-families__head">
          <p className="vp-eyebrow vp-eyebrow--gold" data-reveal="mask">
            {block?.subtitle || 'عالم العطر'}
          </p>
          <h2 id="vp-fam-title" className="vp-h2" data-reveal="mask">
            <span>{block?.title || 'ابدأ من الرائحة.'}</span>
          </h2>
        </div>
        <ul className="vp-families__list">
          {families.map((f, i) => {
            const items = products.filter((p) => p.familySlug === f.slug);
            const count = f.count ?? items.length;
            const lead = items[0];
            const soon = count === 0;
            const label = soon ? 'قريبًا' : count === 1 ? 'عطر واحد' : count === 2 ? 'عطران' : `${count} عطور`;
            return (
              <li key={f.slug} data-reveal="up" style={cv({ '--i': i })}>
                <Link
                  href={soon ? '/products' : `/products?families=${encodeURIComponent(f.slug)}`}
                  className={`vp-fam ${soon ? 'is-soon' : ''}`}
                  data-fam-row
                  data-img={heroImage(lead) ?? '/images/brand/hero-bottle.webp'}
                  data-field={lead?.artField ?? 'ink'}
                  data-transition
                  data-cursor={soon ? 'قريبًا' : 'استكشف'}
                  aria-label={`${f.name} — ${label}`}
                >
                  <span className="vp-fam__idx" dir="ltr">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="vp-fam__ar">{f.name}</span>
                  <span className="vp-fam__en" dir="ltr">
                    {f.name_en ?? ''}
                  </span>
                  <span className="vp-fam__mood">{f.description ?? ''}</span>
                  <span className="vp-fam__count">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="vp-fam-follower" data-fam-follower aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/brand/hero-bottle.webp" alt="" width={300} height={400} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 05 — Signature product (pinned story; data-step)
// ---------------------------------------------------------------------------
const TIER_COPY: Record<'top' | 'heart' | 'base', { ar: string; en: string; line: string }> = {
  top: { ar: 'الافتتاحية', en: 'Top', line: 'أول ثانية: الانطباع الأول.' },
  heart: { ar: 'القلب', en: 'Heart', line: 'بعد دقائق: الطابع الحقيقي.' },
  base: { ar: 'القاعدة', en: 'Base', line: 'لساعات: ما يبقى بعد رحيلك.' },
};
export function SignatureSection({ product, block }: { product: ProductDetail | undefined; block?: CmsBlockRow }) {
  if (!product) return null;
  const p = product;
  const v = firstAvailable(p);
  const img = heroImage(p);
  const name = displayName(p);
  const word = shortName(p);
  const tiers = (['top', 'heart', 'base'] as const)
    .map((k) => ({ key: k, notes: p.notes[k], ...TIER_COPY[k] }))
    .filter((t) => t.notes.length > 0);
  const labels = ['التوقيع', ...tiers.map((t) => t.ar), 'الطابع'];
  const steps = labels.length;
  const floating: NoteRef[] = [...p.notes.top, ...p.notes.heart, ...p.notes.base].slice(0, 6);
  return (
    <section className="vp-sig" id="signature" data-scene data-steps={steps} aria-labelledby="vp-sig-title" style={cv({ '--steps': steps })}>
      <div className="vp-sig__sticky">
        <div className="vp-sig__bg" aria-hidden="true" />
        <span className="vp-sig__outline" dir="ltr" aria-hidden="true">
          {word}
        </span>
        <div className="vp-sig__floating" aria-hidden="true">
          {floating.map((n, i) => (
            <span key={n.slug} style={cv({ '--i': i })} dir="ltr">
              {n.nameEn || n.name}
            </span>
          ))}
        </div>
        {img ? (
          <div className="vp-sig__bottle" aria-hidden="true">
            <Photo src={img} alt="" width={1035} height={1400} sizes="(max-width: 899px) 240px, 560px" />
          </div>
        ) : null}
        <ol className="vp-sig__rail" aria-hidden="true">
          {labels.map((l, i) => (
            <li key={l} data-step-i={i}>
              <i />
              {l}
            </li>
          ))}
        </ol>
        <div className="vp-sig__panels">
          <div className="vp-sig__panel" data-panel="0">
            <p className="vp-eyebrow vp-eyebrow--gold">{block?.subtitle || 'عطر الموسم · التوقيع'}</p>
            <h2 id="vp-sig-title" className="vp-sig__name">
              <span className="vp-script vp-sig__script" aria-hidden="true">
                Signature
              </span>
              <span dir="ltr">{word}</span>
            </h2>
            <p className="vp-sig__lead">
              {name}
              {p.shortDescription ? ` — ${p.shortDescription}` : ''}
            </p>
          </div>
          {tiers.map((t, i) => (
            <div key={t.key} className="vp-sig__panel" data-panel={i + 1}>
              <p className="vp-eyebrow vp-eyebrow--gold">
                {t.ar} <span dir="ltr">· {t.en} notes</span>
              </p>
              <ul className="vp-sig__notes">
                {t.notes.map((n) => (
                  <li key={n.slug}>
                    <b>{n.name}</b>
                    {n.nameEn ? <span dir="ltr">{n.nameEn}</span> : null}
                  </li>
                ))}
              </ul>
              <p className="vp-sig__lead">{t.line}</p>
            </div>
          ))}
          <div className="vp-sig__panel" data-panel={steps - 1}>
            <p className="vp-eyebrow vp-eyebrow--gold">الطابع</p>
            {p.description && <p className="vp-sig__desc">{p.description}</p>}
            <div className="vp-sig__stats">
              {p.longevity ? <Pips value={p.longevity} label="الثبات" /> : null}
              {p.sillage ? <Pips value={p.sillage} label="الفوحان" /> : null}
              <div className="vp-sig__tags">
                {p.season && <span>{SEASON_LABELS_AR[p.season]}</span>}
                {p.occasions.map((o) => (
                  <span key={o}>{OCCASION_LABELS_AR[o]}</span>
                ))}
                {p.concentration && <span>{CONCENTRATION_LABELS_AR[p.concentration]}</span>}
              </div>
            </div>
            <div className="vp-sig__buy">
              <div className="vp-sig__price">
                <small>يبدأ من</small>
                <b>{v ? formatPrice(v.price) : '—'}</b>
                {v?.compareAtPrice && v.compareAtPrice > v.price ? <s>{formatPrice(v.compareAtPrice)}</s> : null}
              </div>
              <Link href={`/products/${p.slug}`} className="vp-btn vp-btn--gold" data-magnetic data-transition>
                <span>اكتشف {word}</span>
                <Icon name="arrow" size={18} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 08 — Lifestyle (pine; layered)
// ---------------------------------------------------------------------------
export function LifestyleSection({ block, image }: { block?: CmsBlockRow; image: string | null }) {
  const c = cfgOf(block);
  const words = strArr(c.words) ?? ['أسلوب.', 'حضور.', 'ثقة.', 'عناية.'];
  const pillars: [string, string][] =
    Array.isArray(c.pillars) && (c.pillars as unknown[]).every((x) => Array.isArray(x) && x.length === 2)
      ? (c.pillars as [string, string][])
      : [
          ['الأسلوب', 'Style'],
          ['الحضور', 'Presence'],
          ['الثقة', 'Confidence'],
          ['العناية بالذات', 'Self-care'],
          ['الرجولة', 'Masculinity'],
          ['هوية عصرية', 'Modern identity'],
        ];
  const img = block?.image_url || image;
  return (
    <section className="vp-life" aria-labelledby="vp-life-title">
      <div className="vp-life__layers">
        <span className="vp-life__giant" dir="ltr" aria-hidden="true" data-parallax="0.12">
          VELMOR
        </span>
        {img ? (
          <div className="vp-life__visual" data-reveal="img">
            <Photo src={img} alt="" width={1400} height={1209} sizes="(max-width: 899px) 92vw, 580px" data-parallax="-0.06" />
          </div>
        ) : null}
        <div className="vp-life__card" data-parallax="0.1" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/brand/logo-cream.webp" alt="" width={260} height={114} />
          <span dir="ltr">High quality product</span>
        </div>
      </div>
      <div className="vp-wrap vp-life__text">
        <p className="vp-eyebrow vp-eyebrow--gold" data-reveal="mask">
          {block?.subtitle || 'أكثر من عطر'}
        </p>
        <h2 id="vp-life-title" className="vp-life__title">
          <span className="vp-life__static">{block?.title || 'إنه'}</span>
          <span className="vp-life__cycle" data-cycle aria-live="off">
            {words.map((w, i) => (
              <span key={w} className={i === 0 ? 'is-on' : ''}>
                {w}
              </span>
            ))}
          </span>
        </h2>
        <p className="vp-life__body" data-reveal="up">
          {block?.body ||
            'VELMOR ليست مجرد عطور؛ إنها أسلوب حياة تصبح فيه العناية بالذات والأسلوب والثقة جزءًا من هويتك اليومية.'}
        </p>
        <ul className="vp-life__pillars" data-stagger>
          {pillars.map(([ar, en]) => (
            <li key={en} data-reveal="up">
              <b>{ar}</b>
              <span dir="ltr">{en}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 10 — Finale (pinned; the logo "writes" itself)
// ---------------------------------------------------------------------------
export function FinaleSection({
  block,
  whatsapp,
  deliveryLine = 'توصيل داخل بنغازي',
}: {
  block?: CmsBlockRow;
  whatsapp: string;
  deliveryLine?: string;
}) {
  return (
    <section className="vp-finale" data-scene aria-labelledby="vp-finale-title">
      <div className="vp-finale__sticky">
        <div className="vp-finale__glow" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="vp-finale__logo" src="/images/brand/logo-gold.webp" alt="VELMOR Perfumes" width={1060} height={463} loading="lazy" />
        <h2 id="vp-finale-title" className="vp-finale__title">
          <span className="vp-line" data-reveal="mask">
            <span>{block?.title || 'لا تحتاج أن تُعرّف بنفسك.'}</span>
          </span>
          <span className="vp-line" data-reveal="mask" data-delay="160">
            <span className="is-gold">{block?.subtitle || 'عطرك يسبقك.'}</span>
          </span>
        </h2>
        <div className="vp-finale__ctas" data-reveal="up" data-delay="300">
          <Link href={block?.cta_href || '/products'} className="vp-btn vp-btn--gold vp-btn--xl" data-magnetic data-transition>
            <span>{block?.cta_label || 'ابدأ حضورك'}</span>
            <Icon name="arrow" size={20} />
          </Link>
          <Link href="/finder" className="vp-btn vp-btn--ghost" data-magnetic data-transition>
            <span>دعنا نختار لك</span>
          </Link>
        </div>
        <ul className="vp-finale__service">
          <li>
            <Icon name="cash" size={18} /> الدفع عند الاستلام
          </li>
          <li>
            <Icon name="truck" size={18} /> {deliveryLine}
          </li>
          <li>
            <a href={whatsappUrl(whatsapp, 'مرحبًا VELMOR، أريد الطلب عبر واتساب.')} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" size={18} /> طلب عبر واتساب
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Optional sections (off by default; admin can enable) — same visual language
// ---------------------------------------------------------------------------
export function ValuesSection({ blocks }: { blocks: CmsBlockRow[] }) {
  const items = blocks.length
    ? blocks.map((b) => ({ t: b.title ?? '', d: b.body ?? '' }))
    : [
        { t: 'تركيبات غنية', d: 'ثبات وفوحان مدروسان لكل عطر.' },
        { t: 'الدفع عند الاستلام', d: 'ادفع نقدًا عند وصول طلبك.' },
        { t: 'توصيل منزلي', d: 'نوصل طلبك إلى باب منزلك.' },
      ];
  return (
    <section className="vp-values">
      <ul className="vp-wrap vp-values__list" data-stagger>
        {items.slice(0, 3).map((it, i) => (
          <li key={i} data-reveal="up">
            <span className="vp-values__num" dir="ltr">
              {String(i + 1).padStart(2, '0')}
            </span>
            <b>{it.t}</b>
            <p>{it.d}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
