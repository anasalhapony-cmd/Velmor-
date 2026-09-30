/**
 * Product / editorial photography for the storefront.
 *
 * WHY: images uploaded by the shop owner are phone photos — often 3–5 MB and
 * 4000 px wide — while the design shows them 60–550 px wide. A plain <img> makes
 * a phone download, decode (48 MB of RAM for one 12-megapixel JPEG) and
 * composite the original for every tile, which is what made the site feel heavy
 * on phones. This component serves each image through Next's image optimiser
 * instead: resized to the width the layout really needs (`sizes`), re-encoded
 * to WebP, with `srcset` so a phone gets the small file and a desktop the big
 * one. The rendered element is still a single <img> with the same class, so the
 * approved CSS is untouched.
 *
 * SAFETY: only same-origin files and this project's public Supabase bucket are
 * routed through the optimiser (those are the hosts allowed in next.config.mjs).
 * Anything else renders as a plain, lazy <img> — never a broken image or a
 * runtime error for an unexpected host.
 */
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { canOptimizeImage, supabaseHostFromEnv } from '@/lib/utils/image-host';

const SUPABASE_HOST = supabaseHostFromEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);

/** True when `src` may be served through /_next/image (see next.config.mjs). */
export function canOptimize(src: string): boolean {
  return canOptimizeImage(src, SUPABASE_HOST);
}

export interface PhotoProps {
  src: string;
  alt: string;
  /** Intrinsic aspect ratio (reserves space — no layout shift). */
  width: number;
  height: number;
  /**
   * How wide the image is actually displayed, e.g. "(max-width: 899px) 280px, 290px".
   * Required: it is what stops phones downloading desktop-sized files.
   */
  sizes: string;
  /** Above-the-fold image (LCP): eager + high fetch priority. */
  priority?: boolean;
  loading?: 'lazy' | 'eager';
  /** Leave unset: Next's default (75) is always allowed by the optimiser. */
  quality?: number;
  className?: string;
  style?: CSSProperties;
  /** data-* hooks used by the motion engine (e.g. data-parallax). */
  [dataAttr: `data-${string}`]: string | undefined;
}

export function Photo({ src, alt, width, height, sizes, priority, loading, quality, className, style, ...data }: PhotoProps) {
  if (!canOptimize(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        style={style}
        loading={priority ? 'eager' : (loading ?? 'lazy')}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        {...data}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      quality={quality}
      priority={priority}
      loading={priority ? undefined : (loading ?? 'lazy')}
      className={className}
      style={style}
      {...data}
    />
  );
}
