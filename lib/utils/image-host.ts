/**
 * Which image URLs may be served through Next's optimiser (/_next/image).
 * Pure (no env, no imports) so it is unit-testable; the Photo component passes
 * in the Supabase host derived from NEXT_PUBLIC_SUPABASE_URL.
 *
 * Mirrors next.config.mjs `images.remotePatterns`: same-origin files and this
 * project's PUBLIC storage bucket over https. Anything else must NOT go through
 * the optimiser (Next would reject an unconfigured host).
 */
export function canOptimizeImage(src: string, supabaseHost: string | null): boolean {
  if (!src) return false;
  if (src.startsWith('/')) return !src.startsWith('//'); // same-origin path (protocol-relative is external)
  try {
    const u = new URL(src);
    return (
      u.protocol === 'https:' &&
      !!supabaseHost &&
      u.hostname === supabaseHost &&
      u.pathname.startsWith('/storage/v1/object/public/')
    );
  } catch {
    return false;
  }
}

/** Host of NEXT_PUBLIC_SUPABASE_URL, or null when unset/invalid. */
export function supabaseHostFromEnv(url: string | undefined): string | null {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}
