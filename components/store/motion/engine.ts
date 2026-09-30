/**
 * VELMOR storefront motion engine (from the approved Phase-1 design).
 *
 * MOTION ONLY. It never owns commerce state — cart, wishlist, filters, the
 * perfume finder and reviews are real React components. The engine only writes
 * data-attributes and CSS custom properties; every curve lives in store.css:
 *
 *   --p   scroll progress of [data-scene] sections (0→1, lerped)
 *   --x   horizontal offset of a pinned [data-hrail] track
 *   --py  parallax offset of [data-parallax]
 *   --o   per-word opacity inside [data-words-scroll]
 *   --mx/--my  smoothed pointer position (-1..1)
 *
 * Motion tokens (store.css): --ease-editorial (.22,1,.36,1) reveals/text,
 * --ease-curtain (.76,0,.24,1) curtains, --ease-soft (.33,1,.68,1) hovers.
 * Scroll-linked values are lerped for inertia WITHOUT hijacking native scroll.
 * prefers-reduced-motion: the pre-paint script never sets data-motion, and the
 * engine skips parallax, cursor, magnetic and tilt.
 */

import { isReactOwned } from './hydration';

export interface MotionOptions {
  /** Client-side navigation used after the page-transition curtain closes. */
  navigate?: (href: string) => void;
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function initMotion(root: HTMLElement, opts: MotionOptions = {}): () => void {
  const html = document.documentElement;
  const cleanups: (() => void)[] = [];
  // Set by the loop below; lets early code (measure, observers, listeners) wake
  // a sleeping loop without a forward reference to `frame`.
  let wake: () => void = () => {};
  const on = (t: EventTarget, ev: string, fn: (e: any) => void, o?: AddEventListenerOptions) => {
    t.addEventListener(ev, fn, o);
    cleanups.push(() => t.removeEventListener(ev, fn, o));
  };
  const $ = <T extends Element = HTMLElement>(s: string, c: ParentNode = root) => c.querySelector<T>(s) as T | null;
  const $$ = <T extends Element = HTMLElement>(s: string, c: ParentNode = root) => Array.from(c.querySelectorAll<T>(s));

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let desk = vw >= 900;

  html.setAttribute('data-js', '');
  if (reduce) html.setAttribute('data-reduce', '');
  if (fine) html.setAttribute('data-fine', '');

  /* ---------------- Intro (first visit per session; flagged pre-paint) ---------------- */
  const intro = $('[data-intro]');
  if (html.hasAttribute('data-intro') && intro && !reduce && !html.hasAttribute('data-ready')) {
    const t1 = window.setTimeout(() => intro.classList.add('is-out'), 1650);
    const t2 = window.setTimeout(() => {
      html.setAttribute('data-ready', '');
      try {
        sessionStorage.setItem('vp-intro', '1');
      } catch {
        /* storage unavailable */
      }
    }, 1900);
    const t3 = window.setTimeout(() => {
      intro.classList.add('is-gone');
      html.removeAttribute('data-intro');
    }, 2800);
    cleanups.push(() => [t1, t2, t3].forEach(clearTimeout));
  } else {
    html.removeAttribute('data-intro');
    html.setAttribute('data-ready', '');
  }

  /* ---------------- Reveals ----------------
     Geometry check instead of IntersectionObserver: IO treats clip-path-hidden
     elements (mask / image reveals start fully clipped) as never intersecting. */
  $$('[data-stagger]').forEach((p) => $$('[data-reveal]', p).forEach((c, i) => c.style.setProperty('--i', String(i))));
  $$('[data-reveal][data-delay]').forEach((el) => el.style.setProperty('--d', `${el.dataset.delay}ms`));
  let pendingReveals = $$('[data-reveal]').filter((el) => !el.hasAttribute('data-in'));
  let lastRevealCheck = 0;
  // Nodes streamed in AFTER start-up (a later <Suspense> boundary) may not be
  // hydrated yet; writing `data-in` on them would make React report a mismatch.
  // They wait until React owns them, but never longer than UNOWNED_GRACE_MS.
  const UNOWNED_GRACE_MS = 4000;
  const firstSeen = new WeakMap<Element, number>();
  /**
   * Returns true when another check is needed soon (throttled, or nodes are
   * waiting for React). All geometry is READ first and `data-in` is written
   * after, so revealing N elements costs one layout pass, not N.
   */
  const checkReveals = (now: number, force = false): boolean => {
    if (!pendingReveals.length) return false;
    if (!force && now - lastRevealCheck < 90) return true;
    lastRevealCheck = now;
    const enter: Element[] = [];
    let retry = false;
    pendingReveals = pendingReveals.filter((el) => {
      if (!el.isConnected) return false;
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.93 && r.bottom > 0) {
        if (!isReactOwned(el, root)) {
          const t0 = firstSeen.get(el) ?? now;
          firstSeen.set(el, t0);
          if (now - t0 < UNOWNED_GRACE_MS) {
            retry = true;
            return true;
          }
        }
        enter.push(el);
        return false;
      }
      return true;
    });
    enter.forEach((el) => el.setAttribute('data-in', ''));
    return retry;
  };
  // New reveal targets rendered later by React (e.g. finder results, filtered grids).
  const mo = new MutationObserver(() => {
    const fresh = $$('[data-reveal]').filter((el) => !el.hasAttribute('data-in') && !pendingReveals.includes(el));
    if (fresh.length) {
      pendingReveals = pendingReveals.concat(fresh);
      wake();
    }
  });
  mo.observe(root, { childList: true, subtree: true });
  cleanups.push(() => mo.disconnect());

  /* ---------------- Word-by-word highlight (Arabic-safe: whole words only) ---------------- */
  const wordBlocks = $$('[data-words-scroll]').map((el) => ({ el, words: $$('.vp-w', el), last: -1 }));

  /* ---------------- Registries ---------------- */
  const scenes = $$('[data-scene]').map((el) => ({ el, steps: Number(el.dataset.steps || 0), cur: 0, step: -1 }));
  const rails = $$('[data-hrail]').map((el) => ({
    el,
    track: $('[data-hrail-track]', el)!,
    idx: $('[data-rail-index]', el),
    count: $$('[data-rail-item]', el).length,
    overflow: 0,
    cur: 0,
  }));
  const parallax = $$('[data-parallax]').map((el) => ({ el, f: Number(el.dataset.parallax), cur: 0 }));
  const marquees = $$('[data-marquee]');
  const header = document.querySelector<HTMLElement>('[data-header]');

  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    desk = vw >= 900;
    rails.forEach((r) => {
      if (!r.track) return;
      if (desk && !reduce) {
        r.overflow = Math.max(0, r.track.scrollWidth - vw);
        r.el.style.height = `${r.overflow + vh}px`;
        r.el.setAttribute('data-pinned', '');
      } else {
        r.overflow = 0;
        r.el.style.height = '';
        r.el.removeAttribute('data-pinned');
        r.track.style.removeProperty('--x');
      }
    });
    wake();
  }
  measure();
  on(window, 'resize', measure, { passive: true });
  on(window, 'load', measure);
  const fontsReady = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  fontsReady?.then(() => measure());

  on(window, 'scroll', () => wake(), { passive: true });
  // Layout can move without any scroll (images decoding, fonts swapping, an
  // accordion opening): a sleeping loop must notice and re-measure.
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => wake());
    ro.observe(root);
    cleanups.push(() => ro.disconnect());
  }

  /* ---------------- Pointer ---------------- */
  const mouse = { x: vw / 2, y: vh / 2, nx: 0, ny: 0, sx: 0, sy: 0 };
  on(
    window,
    'pointermove',
    (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.nx = (e.clientX / vw) * 2 - 1;
      mouse.ny = (e.clientY / vh) * 2 - 1;
      wake();
    },
    { passive: true }
  );

  /* ---------------- Cursor ---------------- */
  const cursor = document.querySelector<HTMLElement>('[data-cursor-el]');
  const cursorLabel = document.querySelector<HTMLElement>('[data-cursor-label]');
  const ring = { x: vw / 2, y: vh / 2 };
  if (cursor && fine && !reduce) {
    html.setAttribute('data-cursor-on', '');
    on(document, 'pointerover', (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      const lab = t.closest?.<HTMLElement>('[data-cursor]');
      const hov = t.closest?.('a,button,input,select,textarea,label');
      const text = t.closest?.('input,textarea,select');
      cursor.classList.toggle('is-label', !!lab && !text);
      cursor.classList.toggle('is-hover', !!hov && !lab);
      cursor.classList.toggle('is-text', !!text);
      if (cursorLabel) cursorLabel.textContent = lab?.dataset.cursor ?? '';
    });
    on(document, 'pointerdown', () => cursor.classList.add('is-down'));
    on(document, 'pointerup', () => cursor.classList.remove('is-down'));
    on(document.documentElement, 'pointerleave', () => cursor.classList.add('is-hidden'));
    on(document.documentElement, 'pointerenter', () => cursor.classList.remove('is-hidden'));
  }

  /* ---------------- Magnetic buttons & tilt cards (delegated → works for React re-renders) ---------------- */
  if (fine && !reduce) {
    on(root, 'pointermove', (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      const mag = t.closest?.<HTMLElement>('[data-magnetic]');
      if (mag) {
        const r = mag.getBoundingClientRect();
        mag.style.setProperty('--mx', `${(e.clientX - (r.left + r.width / 2)) * 0.28}px`);
        mag.style.setProperty('--my', `${(e.clientY - (r.top + r.height / 2)) * 0.38}px`);
      }
      const tilt = t.closest?.<HTMLElement>('[data-tilt]');
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        tilt.style.setProperty('--ry', `${(px - 0.5) * 9}deg`);
        tilt.style.setProperty('--rx', `${(0.5 - py) * 7}deg`);
        tilt.style.setProperty('--gx', `${px * 100}%`);
        tilt.style.setProperty('--gy', `${py * 100}%`);
      }
    });
    on(
      root,
      'pointerout',
      (e: PointerEvent) => {
        const t = e.target as HTMLElement;
        const rel = e.relatedTarget as Node | null;
        const mag = t.closest?.<HTMLElement>('[data-magnetic]');
        if (mag && !(rel && mag.contains(rel))) {
          mag.style.setProperty('--mx', '0px');
          mag.style.setProperty('--my', '0px');
        }
        const tilt = t.closest?.<HTMLElement>('[data-tilt]');
        if (tilt && !(rel && tilt.contains(rel))) {
          tilt.style.setProperty('--ry', '0deg');
          tilt.style.setProperty('--rx', '0deg');
        }
      },
      { passive: true }
    );
  }

  /* ---------------- Families: cursor-following bottle ---------------- */
  const famSection = $('[data-families]');
  const follower = $('[data-fam-follower]');
  const followerImg = follower?.querySelector('img') ?? null;
  const fol = { x: 0, y: 0, active: false };
  if (famSection && follower && fine && !reduce) {
    const list = $('.vp-families__list', famSection);
    const rows = $$('[data-fam-row]', famSection);
    rows.forEach((row) =>
      on(row, 'pointerenter', () => {
        if (followerImg && row.dataset.img && followerImg.getAttribute('src') !== row.dataset.img) {
          followerImg.setAttribute('src', row.dataset.img);
        }
        follower.dataset.field = row.dataset.field ?? 'ink';
        follower.classList.add('is-on');
        list?.classList.add('is-hovering');
        rows.forEach((r) => r.classList.toggle('is-active', r === row));
        fol.active = true;
      })
    );
    on(list ?? famSection, 'pointerleave', () => {
      follower.classList.remove('is-on');
      list?.classList.remove('is-hovering');
      rows.forEach((r) => r.classList.remove('is-active'));
      fol.active = false;
    });
  }

  /* ---------------- Page-transition curtain ---------------- */
  const curtain = document.querySelector<HTMLElement>('[data-curtain]');
  on(root, 'click', (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.<HTMLAnchorElement>('a[data-transition]');
    if (!a || e.defaultPrevented) return;
    const href = a.getAttribute('href') ?? '';
    if (!href || href.startsWith('#') || a.target === '_blank' || /^[a-z]+:/i.test(href)) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (reduce || !opts.navigate) return; // plain Link navigation
    e.preventDefault();
    curtain?.classList.add('is-on');
    window.setTimeout(() => opts.navigate?.(href), 560);
  });

  /* ---------------- Lifestyle word cycle ---------------- */
  const cycle = $('[data-cycle]');
  if (cycle && !reduce) {
    const items = $$('span', cycle);
    let ci = Math.max(0, items.findIndex((s) => s.classList.contains('is-on')));
    const iv = window.setInterval(() => {
      const r = cycle.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh || items.length < 2) return;
      const prev = items[ci];
      prev?.classList.remove('is-on');
      prev?.classList.add('is-off');
      window.setTimeout(() => prev?.classList.remove('is-off'), 900);
      ci = (ci + 1) % items.length;
      items[ci]?.classList.add('is-on');
    }, 2300);
    cleanups.push(() => window.clearInterval(iv));
  }

  /* ---------------- The loop ----------------
     Sleeps when nothing moves and wakes on scroll / resize / pointer / DOM
     mutation. An always-on loop that read layout every frame kept phones busy
     even when idle — and, while CSS animations run, forced a style
     recalculation per frame. Within a frame every layout READ happens first and
     every style WRITE after, so a frame costs at most one style+layout pass. */
  let lastY = window.scrollY;
  let vel = 0;
  let raf = 0;
  let alive = true;
  let headerHidden = false;
  let settling = true; // a lerped value (or a reveal check) still needs another frame
  let dirty = true; // something external changed since the last frame
  let spare = 0; // consecutive idle frames before the loop goes to sleep
  let lastSkew = '';
  const EPS = 0.0005;

  const frame = (now: number) => {
    raf = 0;
    if (!alive) return;
    const y = window.scrollY;
    const dy = y - lastY;
    lastY = y;
    const k = reduce ? 1 : 0.12;
    const work = dirty || dy !== 0 || settling;
    dirty = false;

    vel = lerp(vel, dy, 0.1);
    if (Math.abs(vel) < 0.02) vel = 0;

    if (work) {
      settling = vel !== 0;

      /* ---- READ phase (no style writes until every measurement is taken) ---- */
      const sceneT = scenes.map((s) => {
        const r = s.el.getBoundingClientRect();
        return r.bottom < -vh || r.top > vh * 2 ? null : clamp(-r.top / Math.max(1, r.height - vh));
      });
      const railT = rails.map((r) => {
        if (!r.overflow) return null;
        const rect = r.el.getBoundingClientRect();
        return rect.bottom < -vh || rect.top > vh * 2 ? null : clamp(-rect.top / Math.max(1, rect.height - vh));
      });
      const parT = reduce
        ? []
        : parallax.map((p) => {
            const r = (p.el.parentElement ?? p.el).getBoundingClientRect();
            return r.bottom < -200 || r.top > vh + 200 ? null : (r.top + r.height / 2 - vh / 2) * p.f;
          });
      const wordP = wordBlocks.map((w) => {
        const r = w.el.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return null;
        return reduce ? 1 : clamp((vh * 0.82 - r.top) / (r.height + vh * 0.3));
      });
      // Reveals do their own read-then-write; nothing below has written yet.
      if (pendingReveals.length && checkReveals(now)) settling = true;

      /* ---- WRITE phase ---- */
      if (header) {
        const wantSolid = y > 40;
        if (header.hasAttribute('data-solid') !== wantSolid) header.toggleAttribute('data-solid', wantSolid);
        const menuOpen = !!document.querySelector('[data-menu][data-open]') || !!document.querySelector('[data-drawer-open]');
        if (!menuOpen) {
          if (dy > 4 && y > vh * 0.9 && !headerHidden) {
            headerHidden = true;
            header.setAttribute('data-hidden', '');
          } else if ((dy < -4 || y < vh * 0.5) && headerHidden) {
            headerHidden = false;
            header.removeAttribute('data-hidden');
          }
        } else if (headerHidden) {
          headerHidden = false;
          header.removeAttribute('data-hidden');
        }
      }

      scenes.forEach((s, i) => {
        const target = sceneT[i];
        if (target == null) return;
        s.cur = Math.abs(target - s.cur) < EPS ? target : lerp(s.cur, target, k);
        if (s.cur !== target) settling = true;
        s.el.style.setProperty('--p', s.cur.toFixed(4));
        if (s.steps) {
          const st = Math.min(s.steps - 1, Math.floor(target * s.steps * 0.999));
          if (st !== s.step) {
            s.step = st;
            s.el.dataset.step = String(st);
          }
        }
      });

      rails.forEach((r, i) => {
        const target = railT[i];
        if (target == null) return;
        r.cur = Math.abs(target - r.cur) < EPS ? target : lerp(r.cur, target, k);
        if (r.cur !== target) settling = true;
        // RTL: content overflows to the left, so the track moves right.
        r.track.style.setProperty('--x', `${(r.cur * r.overflow).toFixed(1)}px`);
        r.el.style.setProperty('--p', r.cur.toFixed(4));
        if (r.idx && r.count) {
          r.idx.textContent = String(Math.min(r.count, Math.max(1, Math.round(r.cur * (r.count - 1)) + 1))).padStart(2, '0');
        }
      });

      parallax.forEach((p, i) => {
        const target = parT[i];
        if (target == null) return;
        p.cur = Math.abs(target - p.cur) < 0.05 ? target : lerp(p.cur, target, 0.14);
        if (p.cur !== target) settling = true;
        p.el.style.setProperty('--py', `${p.cur.toFixed(1)}px`);
      });

      wordBlocks.forEach((w, i) => {
        const prog = wordP[i];
        if (prog == null) return;
        const lit = prog * (w.words.length + 2);
        const key = Math.round(lit * 20);
        if (key === w.last) return;
        w.last = key;
        w.words.forEach((sp, j) => sp.style.setProperty('--o', clamp(lit - j).toFixed(2)));
      });

      if (!reduce) {
        const skew = `${clamp(vel * -0.25, -9, 9).toFixed(2)}deg`;
        if (skew !== lastSkew) {
          lastSkew = skew;
          marquees.forEach((m) => m.style.setProperty('--skew', skew));
        }
      }

      // Pointer-driven motion exists only with a fine pointer (never on phones).
      if (fine && !reduce) {
        mouse.sx = lerp(mouse.sx, mouse.nx, 0.06);
        mouse.sy = lerp(mouse.sy, mouse.ny, 0.06);
        if (Math.abs(mouse.sx - mouse.nx) > 0.001 || Math.abs(mouse.sy - mouse.ny) > 0.001) settling = true;
        root.style.setProperty('--mx', mouse.sx.toFixed(3));
        root.style.setProperty('--my', mouse.sy.toFixed(3));
        if (cursor) {
          ring.x = lerp(ring.x, mouse.x, 0.18);
          ring.y = lerp(ring.y, mouse.y, 0.18);
          if (Math.abs(ring.x - mouse.x) > 0.1 || Math.abs(ring.y - mouse.y) > 0.1) settling = true;
          cursor.style.setProperty('--cx', `${mouse.x}px`);
          cursor.style.setProperty('--cy', `${mouse.y}px`);
          cursor.style.setProperty('--rx', `${ring.x.toFixed(1)}px`);
          cursor.style.setProperty('--ry', `${ring.y.toFixed(1)}px`);
        }
      }
      if (follower && fol.active) {
        fol.x = lerp(fol.x, mouse.x, 0.12);
        fol.y = lerp(fol.y, mouse.y, 0.12);
        if (Math.abs(fol.x - mouse.x) > 0.1 || Math.abs(fol.y - mouse.y) > 0.1) settling = true;
        follower.style.setProperty('--fx', `${fol.x.toFixed(1)}px`);
        follower.style.setProperty('--fy', `${fol.y.toFixed(1)}px`);
        follower.style.setProperty('--frot', `${clamp((mouse.x - fol.x) * 0.06, -12, 12).toFixed(2)}deg`);
      } else if (follower) {
        fol.x = mouse.x;
        fol.y = mouse.y;
      }
    }

    if (work) spare = 0;
    if (work || ++spare < 3) raf = requestAnimationFrame(frame);
  };

  wake = () => {
    if (!alive) return;
    dirty = true;
    spare = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  };
  checkReveals(performance.now(), true);
  raf = requestAnimationFrame(frame);
  cleanups.push(() => {
    alive = false;
    cancelAnimationFrame(raf);
  });

  return () => {
    cleanups.forEach((fn) => fn());
    rails.forEach((r) => {
      r.el.style.height = '';
      r.el.removeAttribute('data-pinned');
    });
    header?.removeAttribute('data-hidden');
  };
}
