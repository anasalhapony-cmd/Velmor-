'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AddToBag } from '@/components/store/commerce/AddToBag';
import { Icon, PriceTag, cv } from '@/components/store/ui';
import type { FinderAnswers, FinderResult } from '@/types';
import { Photo } from '@/components/store/photo';

type Opt = { label: string; apply: Partial<FinderAnswers> };
type Question = { key: string; q: string; options: Opt[] };

const ARABIC_COUNT: Record<number, string> = { 3: 'ثلاثة', 4: 'أربعة', 5: 'خمسة', 6: 'ستة' };

const MOODS: Opt[] = [
  { label: 'منعش ونظيف', apply: { freshness: 5, sweetness: 2 } },
  { label: 'دافئ بلمسة حلوة', apply: { sweetness: 5, freshness: 1 } },
  { label: 'هادئ وقريب من الجلد', apply: { intensity: 2 } },
  { label: 'قويّ يملأ المكان', apply: { intensity: 5 } },
  { label: 'لا يهمّ', apply: {} },
];

/**
 * مستشار العطور — the approved gold experience, wired to /api/finder
 * (transparent, deterministic scoring over real product data; no AI).
 */
export function FinderExperience({
  families,
  notes,
  headingLevel = 'h2',
  variant = 'home',
}: {
  families: { slug: string; name: string }[];
  notes: { slug: string; name: string }[];
  headingLevel?: 'h1' | 'h2';
  /** 'home' = the approved four-question block; 'full' = /finder, which adds
   *  the presence (mood) and favourite-note questions. */
  variant?: 'home' | 'full';
}) {
  const questions: Question[] = useMemo(() => {
    const qs: Question[] = [
      {
        key: 'gender',
        q: 'لمن هذا العطر؟',
        options: [
          { label: 'لي — رجالي', apply: { gender: 'MEN' } },
          { label: 'للجنسين', apply: { gender: 'UNISEX' } },
          { label: 'لا يهمّ', apply: {} },
        ],
      },
      {
        key: 'occasion',
        q: 'أين سيحضر معك؟',
        options: [
          { label: 'يومي', apply: { occasion: 'DAILY' } },
          { label: 'العمل', apply: { occasion: 'WORK' } },
          { label: 'رسمي', apply: { occasion: 'FORMAL' } },
          { label: 'سهرة', apply: { occasion: 'EVENING' } },
          { label: 'مناسبات خاصة', apply: { occasion: 'SPECIAL' } },
        ],
      },
      {
        key: 'season',
        q: 'أيّ موسمٍ يشبهك؟',
        options: [
          { label: 'صيف', apply: { season: 'SUMMER' } },
          { label: 'شتاء', apply: { season: 'WINTER' } },
          { label: 'ربيع', apply: { season: 'SPRING' } },
          { label: 'خريف', apply: { season: 'AUTUMN' } },
          { label: 'طوال العام', apply: { season: 'ALL_YEAR' } },
        ],
      },
    ];
    if (variant === 'full') qs.push({ key: 'mood', q: 'كيف تحبّ حضوره؟', options: MOODS });
    if (families.length) {
      qs.push({
        key: 'family',
        q: 'أيّ رائحة تجذبك أولًا؟',
        options: [...families.map((f) => ({ label: f.name, apply: { families: [f.slug] } })), { label: 'فاجئني', apply: {} }],
      });
    }
    if (variant === 'full' && notes.length) {
      qs.push({
        key: 'note',
        q: 'مكوّن تعرفه وتحبّه؟',
        options: [...notes.slice(0, 8).map((n) => ({ label: n.name, apply: { notes: [n.slug] } })), { label: 'تخطَّ', apply: {} }],
      });
    }
    return qs;
  }, [families, notes, variant]);

  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [results, setResults] = useState<FinderResult[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const answers = (p: Record<string, number>): FinderAnswers =>
    questions.reduce<FinderAnswers>((acc, q) => {
      const i = p[q.key];
      return i == null ? acc : { ...acc, ...q.options[i]!.apply };
    }, {});

  async function submit(p: Record<string, number>) {
    setStatus('loading');
    try {
      const res = await fetch('/api/finder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(answers(p)),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { results?: FinderResult[] };
      setResults(data.results ?? []);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  function choose(qi: number, oi: number) {
    const q = questions[qi]!;
    const next = { ...picks, [q.key]: oi };
    setPicks(next);
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(
      () => {
        if (qi === questions.length - 1) {
          setStep(questions.length);
          void submit(next);
        } else setStep(qi + 1);
      },
      reduce ? 0 : 380
    );
  }

  function restart() {
    setPicks({});
    setResults(null);
    setStatus('idle');
    setStep(0);
  }

  const done = step >= questions.length;
  const best = results?.[0];
  const others = results?.slice(1, 3) ?? [];
  const H = headingLevel;

  return (
    <section className="vp-finder" id="finder" aria-labelledby="vp-finder-title">
      <div className={`vp-wrap vp-finder__grid${done ? ' is-done' : ''}`}>
        <div className="vp-finder__intro">
          <p className="vp-eyebrow vp-eyebrow--ink" data-reveal="mask">
            مستشار العطور
          </p>
          <H id="vp-finder-title" className="vp-finder__title" data-reveal="mask">
            <span>أيّ عطرٍ</span>
            <span>يُشبهك؟</span>
          </H>
          <p className="vp-finder__lede" data-reveal="up">
            {variant === 'home'
              ? `${ARABIC_COUNT[questions.length] ?? questions.length} أسئلة. ترشيح مبنيّ على بيانات عطورنا الفعلية — العائلة، الموسم، المناسبة.`
              : `${ARABIC_COUNT[questions.length] ?? questions.length} أسئلة قصيرة. ترشيح شفاف مبنيّ على بيانات عطورنا الفعلية — العائلة والمكوّنات والموسم والمناسبة. بلا ذكاء اصطناعي، وبلا تخمين.`}
          </p>
          <div className="vp-finder__steps" aria-hidden="true">
            {questions.map((q, i) => (
              <span key={q.key} className={i <= Math.min(step, questions.length - 1) ? 'is-on' : ''} />
            ))}
          </div>
        </div>

        <div className="vp-finder__stage" aria-live="polite">
          {questions.map((q, i) => (
            <fieldset key={q.key} className={`vp-finder__q${i === step ? ' is-on' : ''}${i < step ? ' is-past' : ''}`} disabled={i !== step}>
              <legend>
                <span dir="ltr">
                  {i + 1} / {questions.length}
                </span>
                {q.q}
              </legend>
              <div className="vp-finder__opts">
                {q.options.map((o, j) => (
                  <button
                    key={o.label}
                    type="button"
                    style={cv({ '--i': j })}
                    className={picks[q.key] === j ? 'is-picked' : ''}
                    aria-pressed={picks[q.key] === j}
                    onClick={() => choose(i, j)}
                  >
                    <span>{o.label}</span>
                    <Icon name="arrow" size={20} />
                  </button>
                ))}
              </div>
              {i > 0 && (
                <button type="button" className="vp-finder__back" onClick={() => setStep(i - 1)}>
                  رجوع
                </button>
              )}
            </fieldset>
          ))}

          <div className={`vp-finder__result${done ? ' is-on' : ''}`} aria-busy={status === 'loading'}>
            <p className="vp-eyebrow vp-eyebrow--ink">عطرك</p>
            {status === 'loading' && <p className="vp-finder__wait">نقارن إجاباتك بعطورنا…</p>}
            {status === 'error' && (
              <div className="vp-finder__error" role="alert">
                <p>تعذّر الوصول إلى المستشار الآن.</p>
                <button type="button" className="vp-btn vp-btn--ink" onClick={() => void submit(picks)}>
                  أعد المحاولة
                </button>
              </div>
            )}
            {status === 'idle' && results && !best && (
              <p className="vp-finder__wait">لم نجد تطابقًا كافيًا — جرّب إجابات أخرى أو تصفّح المجموعة كاملة.</p>
            )}
            {status === 'idle' && best && (
              <>
                <div className={`vp-match vp-field--${best.product.artField ?? 'ink'}`}>
                  <Link href={`/products/${best.product.slug}`} className="vp-match__img" data-transition data-cursor="اكتشف">
                    {best.product.image ? (
                      <Photo
                        src={best.product.image}
                        alt={best.product.nameAr || best.product.name}
                        width={400}
                        height={540}
                        sizes="(max-width: 899px) 92vw, 400px"
                      />
                    ) : null}
                  </Link>
                  <div className="vp-match__body">
                    {best.matchPct != null && (
                      <span className="vp-match__pct" dir="ltr">
                        {best.matchPct}%<small>تطابق</small>
                      </span>
                    )}
                    <h3>{best.product.nameAr || best.product.name}</h3>
                    <span className="vp-match__en" dir="ltr">
                      {best.product.name}
                    </span>
                    <p>{best.summary}</p>
                    {best.reasons.length > 0 && (
                      <ul>
                        {best.reasons.slice(0, 4).map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                    <PriceTag price={best.product.minPrice} compareAt={best.product.compareAtPrice} from className="vp-match__price" />
                    <div className="vp-match__actions">
                      <AddToBag
                        className="vp-btn vp-btn--gold"
                        product={{ id: best.product.id, slug: best.product.slug, name: best.product.nameAr || best.product.name, image: best.product.image }}
                        variant={(best.product.variants ?? []).find((v) => v.stockLevel !== 'OUT_OF_STOCK')}
                        label="أضف إلى السلة"
                      />
                      <Link href={`/products/${best.product.slug}`} className="vp-link" data-transition>
                        تفاصيل العطر
                      </Link>
                    </div>
                  </div>
                </div>
                {others.length > 0 && (
                  <div className="vp-finder__others">
                    {others.map((r) => (
                      <Link key={r.product.id} href={`/products/${r.product.slug}`} data-transition>
                        {r.product.image ? (
                          <Photo src={r.product.image} alt="" width={80} height={108} sizes="80px" />
                        ) : null}
                        <span>
                          <b>{r.product.nameAr || r.product.name}</b>
                          {r.matchPct != null && <small dir="ltr">{r.matchPct}%</small>}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="vp-finder__actions">
              <button type="button" className="vp-btn vp-btn--ink" onClick={restart}>
                ابدأ من جديد
              </button>
              {variant === 'home' ? (
                <Link href="/finder" className="vp-link vp-link--ink" data-transition>
                  المستشار الكامل
                </Link>
              ) : (
                <Link href="/products" className="vp-link vp-link--ink" data-transition>
                  تصفّح كل العطور
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
