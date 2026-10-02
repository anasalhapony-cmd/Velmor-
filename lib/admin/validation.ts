import { z } from 'zod';
import {
  GENDERS,
  CONCENTRATIONS,
  SEASONS,
  OCCASIONS,
  NOTE_TIERS,
  COUPON_TYPES,
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  INVENTORY_REASONS,
} from '@/config/constants';

/** Normalise a name into a URL slug. Keeps Arabic letters; used to suggest slugs. */
export function slugify(input: string): string {
  return input
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

const slug = z
  .string()
  .trim()
  .min(1, 'الرابط (slug) مطلوب')
  .max(120)
  .regex(/^[a-z0-9؀-ۿ-]+$/, 'الرابط يقبل حروفًا وأرقامًا وشرطات فقط');

const optText = (max = 500) => z.string().trim().max(max).optional();
const sortOrder = z.number().int().min(0).max(100000).default(0);
const isoDate = z.string().trim().datetime({ offset: true }).optional().or(z.literal('').transform(() => undefined));

// --- Taxonomy ---------------------------------------------------------------

export const brandSchema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب').max(120),
  slug,
  name_en: optText(120),
  description: optText(2000),
  logo_url: optText(600),
  image_url: optText(600),
  seo_title: optText(160),
  seo_description: optText(320),
  active: z.boolean().default(true),
  sort_order: sortOrder,
});
export type BrandInput = z.infer<typeof brandSchema>;

export const categorySchema = brandSchema
  .omit({ logo_url: true })
  .extend({ parent_id: z.string().uuid().optional() });
export type CategoryInput = z.infer<typeof categorySchema>;

export const collectionSchema = brandSchema
  .omit({ logo_url: true })
  .extend({ is_seasonal: z.boolean().default(false) });
export type CollectionInput = z.infer<typeof collectionSchema>;

export const familySchema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب').max(120),
  slug,
  name_en: optText(120),
  description: optText(1000),
  image_url: optText(600),
  active: z.boolean().default(true),
  sort_order: sortOrder,
});
export type FamilyInput = z.infer<typeof familySchema>;

export const noteSchema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب').max(120),
  slug,
  name_en: optText(120),
  icon_url: optText(600),
  active: z.boolean().default(true),
  sort_order: sortOrder,
});
export type NoteInput = z.infer<typeof noteSchema>;

export const deliveryZoneSchema = z.object({
  name: z.string().trim().min(1, 'اسم المنطقة مطلوب').max(120),
  city: z.string().trim().min(1, 'المدينة مطلوبة').max(80),
  area: optText(120),
  fee: z.number().min(0, 'الرسوم يجب ألا تكون سالبة').max(100000),
  active: z.boolean().default(true),
  sort_order: sortOrder,
});
export type DeliveryZoneInput = z.infer<typeof deliveryZoneSchema>;

// --- Products & variants ----------------------------------------------------

export const productSchema = z.object({
  name: z.string().trim().min(1, 'اسم المنتج مطلوب').max(160),
  name_ar: optText(160),
  slug,
  brand_id: z.string().uuid().optional(),
  family_id: z.string().uuid().optional(),
  gender: z.enum(GENDERS).optional(),
  concentration: z.enum(CONCENTRATIONS).optional(),
  season: z.enum(SEASONS).optional(),
  occasions: z.array(z.enum(OCCASIONS)).max(5).default([]),
  short_description: optText(300),
  description: optText(5000),
  longevity: z.number().int().min(1).max(5).optional(),
  sillage: z.number().int().min(1).max(5).optional(),
  freshness: z.number().int().min(1).max(5).optional(),
  sweetness: z.number().int().min(1).max(5).optional(),
  inspiration_profile: optText(280),
  art_field: z.enum(['ink', 'paper', 'pine', 'gold', 'char']).default('ink'),
  video_url: optText(600),
  is_featured: z.boolean().default(false),
  is_new_arrival: z.boolean().default(false),
  is_best_seller: z.boolean().default(false),
  active: z.boolean().default(true),
  archived: z.boolean().default(false),
  sort_order: sortOrder,
  seo_title: optText(160),
  seo_description: optText(320),
  og_image_url: optText(600),
  category_ids: z.array(z.string().uuid()).default([]),
  collection_ids: z.array(z.string().uuid()).default([]),
});
export type ProductInput = z.infer<typeof productSchema>;

export const variantSchema = z
  .object({
    size: z.number().positive('الحجم يجب أن يكون أكبر من صفر').max(100000),
    unit: z.string().trim().min(1).max(12).default('ml'),
    sku: optText(60),
    barcode: optText(60),
    price: z.number().positive('السعر يجب أن يكون أكبر من صفر').max(1_000_000),
    compare_at_price: z.number().positive().max(1_000_000).optional(),
    stock_quantity: z.number().int().min(0, 'المخزون يجب ألا يكون سالبًا').max(1_000_000).default(0),
    weight_grams: z.number().int().min(0).max(1_000_000).optional(),
    active: z.boolean().default(true),
    position: sortOrder,
  })
  .refine((v) => v.compare_at_price == null || v.compare_at_price >= v.price, {
    message: 'سعر المقارنة يجب أن يكون أكبر من أو يساوي السعر',
    path: ['compare_at_price'],
  });
export type VariantInput = z.infer<typeof variantSchema>;

export const productNoteSchema = z.object({
  note_id: z.string().uuid(),
  tier: z.enum(NOTE_TIERS),
  position: sortOrder,
});
export type ProductNoteInput = z.infer<typeof productNoteSchema>;

// --- Coupons & promotions ---------------------------------------------------

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, 'الكود مطلوب')
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, 'الكود يقبل حروفًا لاتينية وأرقامًا فقط'),
    type: z.enum(COUPON_TYPES),
    value: z.number().positive('القيمة يجب أن تكون أكبر من صفر'),
    min_order_amount: z.number().min(0).default(0),
    max_discount: z.number().min(0).optional(),
    starts_at: isoDate,
    ends_at: isoDate,
    usage_limit: z.number().int().min(0).optional(),
    per_customer_limit: z.number().int().min(0).optional(),
    active: z.boolean().default(true),
    product_ids: z.array(z.string().uuid()).default([]),
    category_ids: z.array(z.string().uuid()).default([]),
    brand_ids: z.array(z.string().uuid()).default([]),
  })
  .refine((c) => c.type !== 'PERCENTAGE' || (c.value > 0 && c.value <= 100), {
    message: 'نسبة الخصم يجب أن تكون بين 1 و 100',
    path: ['value'],
  })
  .refine((c) => !c.starts_at || !c.ends_at || new Date(c.ends_at) >= new Date(c.starts_at), {
    message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء',
    path: ['ends_at'],
  });
export type CouponInput = z.infer<typeof couponSchema>;

export const promotionSchema = z.object({
  title: z.string().trim().min(1, 'العنوان مطلوب').max(160),
  kind: z.string().trim().min(1).max(40).default('SALE'),
  config: z.string().trim().optional(), // raw JSON string; parsed in the action
  starts_at: isoDate,
  ends_at: isoDate,
  active: z.boolean().default(true),
  sort_order: sortOrder,
});
export type PromotionInput = z.infer<typeof promotionSchema>;

// --- CMS --------------------------------------------------------------------

export const pageSchema = z.object({
  slug,
  title: z.string().trim().min(1, 'العنوان مطلوب').max(160),
  body: z.string().max(50000).default(''),
  is_placeholder: z.boolean().default(true),
  approved: z.boolean().default(false),
  noindex: z.boolean().default(true),
  active: z.boolean().default(true),
  seo_title: optText(160),
  seo_description: optText(320),
});
export type PageInput = z.infer<typeof pageSchema>;

export const faqSchema = z.object({
  question: z.string().trim().min(1, 'السؤال مطلوب').max(300),
  answer: z.string().trim().min(1, 'الإجابة مطلوبة').max(3000),
  active: z.boolean().default(true),
  sort_order: sortOrder,
});
export type FaqInput = z.infer<typeof faqSchema>;

export const cmsBlockSchema = z.object({
  section_key: z.string().trim().min(1).max(60),
  title: optText(200),
  subtitle: optText(300),
  body: optText(3000),
  image_url: optText(600),
  cta_label: optText(60),
  cta_href: optText(300),
  active: z.boolean().default(true),
  sort_order: sortOrder,
  starts_at: isoDate,
  ends_at: isoDate,
});
export type CmsBlockInput = z.infer<typeof cmsBlockSchema>;

export const homepageSectionSchema = z.object({
  key: z.string().trim().min(1).max(60),
  title: optText(120),
  active: z.boolean().default(true),
  sort_order: sortOrder,
});
export type HomepageSectionInput = z.infer<typeof homepageSectionSchema>;

// --- Inventory adjustment ---------------------------------------------------

export const inventoryAdjustSchema = z.object({
  variant_id: z.string().uuid(),
  change: z.number().int().refine((n) => n !== 0, 'التغيير يجب ألا يكون صفرًا'),
  reason: z.enum(INVENTORY_REASONS.filter((r) => r !== 'SALE' && r !== 'CANCELLATION') as [string, ...string[]]),
  note: optText(300),
});
export type InventoryAdjustInput = z.infer<typeof inventoryAdjustSchema>;

/** Permanent perfume deletion (the typed name is re-checked by the database). */
export const productDeleteSchema = z.object({
  product_id: z.string().uuid(),
  confirm_name: z.string().trim().min(1, 'اكتب اسم العطر للتأكيد').max(200),
});
export type ProductDeleteInput = z.infer<typeof productDeleteSchema>;

// --- Admin accounts ---------------------------------------------------------

export const adminAccountSchema = z.object({
  email: z.string().trim().email('بريد إلكتروني غير صالح').max(160),
  full_name: z.string().trim().min(1, 'الاسم مطلوب').max(120),
  role: z.enum(ADMIN_ROLES),
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)).default([]),
  active: z.boolean().default(true),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل').max(72).optional(),
});
export type AdminAccountInput = z.infer<typeof adminAccountSchema>;

// --- Settings ---------------------------------------------------------------

export const settingUpdateSchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.unknown(),
});
