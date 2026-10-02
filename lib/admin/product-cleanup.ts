import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { storagePathFromPublicUrl } from '@/lib/admin/storage-path';
import { supabaseHostFromEnv } from '@/lib/utils/image-host';

export const PRODUCT_IMAGES_BUCKET = 'product-images';

export interface CleanupResult {
  /** Files removed from Storage. */
  removed: number;
  /** Files deliberately kept because something else still shows them. */
  kept: number;
  /** Files that should have been removed but could not be (left for manual cleanup). */
  failed: number;
}

type Probe = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * After a perfume is permanently deleted, remove its image files from Storage —
 * EXCEPT any file that is still referenced somewhere:
 *   - order_items.image_snapshot  (order history keeps showing the photo)
 *   - another product's image / og image, brand / category / collection / family
 *     images, CMS blocks, homepage sections, promotions
 * Fail-closed: if any of those lookups errors, nothing is deleted (an orphaned
 * file costs a few KB; a broken thumbnail in an old order is a visible defect).
 *
 * Best-effort by design — the database delete has already succeeded and is the
 * source of truth, so this never throws.
 */
export async function removeOrphanedProductImages(urls: string[]): Promise<CleanupResult> {
  const result: CleanupResult = { removed: 0, kept: 0, failed: 0 };
  try {
    const host = supabaseHostFromEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const candidates = new Map<string, string>(); // url -> object path
    for (const url of new Set(urls)) {
      const path = storagePathFromPublicUrl(url, host, PRODUCT_IMAGES_BUCKET);
      if (path) candidates.set(url, path);
    }
    if (candidates.size === 0) return result;
    const list = [...candidates.keys()];

    const admin = createAdminClient();
    const probes: Probe[] = [
      admin.from('order_items').select('image_snapshot').in('image_snapshot', list),
      admin.from('product_images').select('url').in('url', list),
      admin.from('products').select('og_image_url').in('og_image_url', list),
      admin.from('brands').select('logo_url').in('logo_url', list),
      admin.from('brands').select('image_url').in('image_url', list),
      admin.from('categories').select('image_url').in('image_url', list),
      admin.from('collections').select('image_url').in('image_url', list),
      admin.from('fragrance_families').select('image_url').in('image_url', list),
      admin.from('cms_blocks').select('image_url').in('image_url', list),
      // JSON config blobs: tiny tables, scanned as text.
      admin.from('homepage_sections').select('config'),
      admin.from('promotions').select('config'),
    ];
    const settled = await Promise.all(probes);

    const referenced = new Set<string>();
    for (const { data, error } of settled) {
      if (error) {
        console.error('[product-cleanup] reference lookup failed, keeping all files:', error.message);
        result.kept = list.length;
        return result;
      }
      for (const row of (data as Record<string, unknown>[] | null) ?? []) {
        for (const v of Object.values(row)) {
          if (typeof v === 'string') {
            if (candidates.has(v)) referenced.add(v);
          } else if (v !== null && typeof v === 'object') {
            const blob = JSON.stringify(v);
            for (const url of list) if (blob.includes(url)) referenced.add(url);
          }
        }
      }
    }

    const toRemove: string[] = [];
    for (const [url, path] of candidates) {
      if (referenced.has(url)) result.kept++;
      else toRemove.push(path);
    }
    if (toRemove.length === 0) return result;

    const { error } = await admin.storage.from(PRODUCT_IMAGES_BUCKET).remove(toRemove);
    if (error) {
      console.error('[product-cleanup] storage remove failed:', error.message);
      result.failed = toRemove.length;
    } else {
      result.removed = toRemove.length;
    }
  } catch (err) {
    console.error('[product-cleanup] unexpected error:', err);
    result.failed = Math.max(result.failed, 1);
  }
  return result;
}
