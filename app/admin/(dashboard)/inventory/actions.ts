'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { permittedActor } from '@/lib/admin/auth';
import { FULL_ACCESS_ROLES } from '@/lib/admin/permissions';
import { removeOrphanedProductImages } from '@/lib/admin/product-cleanup';
import { inventoryAdjustSchema, productDeleteSchema } from '@/lib/admin/validation';
import { fail, ok, zodFieldErrors, str, optStr, num, type FormState } from '@/lib/admin/form';
import type { InventoryReason } from '@/config/constants';

function mapError(msg: string | undefined): string {
  const m = msg ?? '';
  if (m.includes('INSUFFICIENT_STOCK')) return 'الكمية غير كافية — سيصبح المخزون سالبًا.';
  if (m.includes('RESERVED_REASON')) return 'هذا السبب محجوز لنظام الطلبات.';
  if (m.includes('NOT_AUTHORIZED')) return 'ليست لديك صلاحية إدارة المخزون.';
  if (m.includes('VARIANT_NOT_FOUND')) return 'المقاس غير موجود.';
  return 'تعذّر تعديل المخزون.';
}

export async function adjustStock(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await permittedActor('manage_inventory');
  if (!me) return fail('ليست لديك صلاحية إدارة المخزون.');

  const parsed = inventoryAdjustSchema.safeParse({
    variant_id: str(fd, 'variant_id'),
    change: num(fd, 'change'),
    reason: str(fd, 'reason'),
    note: optStr(fd, 'note'),
  });
  if (!parsed.success) return fail('يرجى مراجعة الحقول.', zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_adjust_inventory', {
    p_variant_id: parsed.data.variant_id,
    p_change: parsed.data.change,
    p_reason: parsed.data.reason as InventoryReason,
    p_note: parsed.data.note ?? null,
  });
  if (error) return fail(mapError(error.message));

  revalidatePath('/admin/inventory');
  revalidatePath(`/admin/inventory/${parsed.data.variant_id}`);
  return ok('تم تحديث المخزون.');
}

// --- Permanent deletion -------------------------------------------------------

function mapDeleteError(error: { message?: string; details?: string | null } | null): string {
  const m = error?.message ?? '';
  const n = Number.parseInt(error?.details ?? '', 10);
  const count = Number.isFinite(n) && n > 0 ? ` (${n})` : '';
  if (m.includes('NOT_AUTHORIZED')) return 'الحذف النهائي متاح للمالك والمشرف العام فقط.';
  if (m.includes('PRODUCT_NOT_FOUND')) return 'هذا العطر غير موجود (ربما حُذف مسبقًا).';
  if (m.includes('CONFIRMATION_MISMATCH')) return 'الاسم المكتوب لا يطابق اسم العطر. لم يُحذف شيء.';
  if (m.includes('HAS_OPEN_ORDERS')) {
    return `لا يمكن الحذف الآن: يوجد طلبات مفتوحة${count} تحتوي هذا العطر. أنهِها أو ألغِها أولًا، أو أخفِ العطر بالأرشفة بدل الحذف.`;
  }
  if (m.includes('HAS_RESERVED_STOCK')) {
    return `لا يمكن الحذف الآن: توجد كمية محجوزة${count} لهذا العطر في طلبات قيد التنفيذ.`;
  }
  return 'تعذّر حذف العطر. لم يتغيّر شيء.';
}

/** Keep only the list filters when returning to the inventory page (no open redirect). */
function backToInventory(raw: string, extra: Record<string, string>): string {
  const src = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  const out = new URLSearchParams();
  for (const k of ['q', 'filter', 'page']) {
    const v = src.get(k);
    if (v) out.set(k, v.slice(0, 120));
  }
  for (const [k, v] of Object.entries(extra)) out.set(k, v);
  const qs = out.toString();
  return qs ? `/admin/inventory?${qs}` : '/admin/inventory';
}

/**
 * Permanently delete a perfume (and, through it, its sizes, photos, notes,
 * reviews, wishlist entries and stock ledger). Orders are kept — they hold their
 * own snapshot of what was bought.
 *
 * Authority is the database function admin_delete_product: it re-checks that the
 * caller is an owner/admin, re-checks the typed name, refuses while orders for the
 * perfume are still open, and serialises against order creation. The role check
 * below only gives a friendlier early answer; it is not what protects the data.
 */
export async function deleteProductPermanently(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await permittedActor('manage_products');
  if (!me || !FULL_ACCESS_ROLES.includes(me.role)) {
    return fail('الحذف النهائي متاح للمالك والمشرف العام فقط.');
  }

  const parsed = productDeleteSchema.safeParse({
    product_id: str(fd, 'product_id'),
    confirm_name: str(fd, 'confirm_name'),
  });
  if (!parsed.success) return fail('اكتب اسم العطر للتأكيد.', zodFieldErrors(parsed.error));

  // Must run as the signed-in admin (the function reads auth.uid()), never the service role.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_delete_product', {
    p_product_id: parsed.data.product_id,
    p_confirm_name: parsed.data.confirm_name,
  });
  if (error) return fail(mapDeleteError(error));

  // The perfume is gone. Now free its photos in Storage (never blocks, never throws).
  const res = (data ?? {}) as { name?: unknown; images?: unknown };
  const urls = Array.isArray(res.images) ? res.images.filter((u): u is string => typeof u === 'string') : [];
  const cleanup = await removeOrphanedProductImages(urls);

  // The storefront reads straight from the database, but cached HTML / router
  // payloads for the homepage, shop, search and product pages must not outlive it.
  revalidatePath('/', 'layout');

  const name = typeof res.name === 'string' ? res.name.slice(0, 80) : '';
  redirect(
    backToInventory(str(fd, 'back'), {
      deleted: name || '1',
      ...(cleanup.failed > 0 ? { leftover: String(cleanup.failed) } : {}),
    })
  );
}
