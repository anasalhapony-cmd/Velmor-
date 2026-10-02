/**
 * Maps a PUBLIC Supabase Storage URL back to its object path inside a bucket.
 * Pure (no env, no imports) so it is unit-testable.
 *
 * It is deliberately strict: only https URLs on THIS project's host, inside the
 * given bucket, with a clean relative path. Anything else (another host, another
 * bucket, `..` segments, empty path) returns null, so a cleanup job can never be
 * pointed at an object it did not create.
 */
export function storagePathFromPublicUrl(url: string, supabaseHost: string | null, bucket: string): string | null {
  if (!url || !supabaseHost) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== supabaseHost) return null;
  const prefix = `/storage/v1/object/public/${bucket}/`;
  if (!u.pathname.startsWith(prefix)) return null;

  let path: string;
  try {
    path = decodeURIComponent(u.pathname.slice(prefix.length));
  } catch {
    return null;
  }
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return null;
  }
  return path;
}
