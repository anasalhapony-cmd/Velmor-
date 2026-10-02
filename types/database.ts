/**
 * Hand-authored Database type mirroring supabase/migrations.
 * Kept in sync manually (this project can't run `supabase gen types` offline).
 * Insert/Update are loosened to Partial<Row> since all writes go through
 * validated server code / SECURITY DEFINER RPCs.
 */
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Gender,
  Concentration,
  Season,
  Occasion,
  NoteTier,
  InventoryReason,
  ReviewStatus,
  CouponType,
  AdminRole,
} from '@/config/constants';

// Money and timestamps arrive as strings from PostgREST (numeric/timestamptz).
type Numeric = number | string;
type Timestamp = string;
type UUID = string;
type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface AdminUserRow {
  id: UUID;
  full_name: string;
  role: AdminRole;
  permissions: string[];
  active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SiteSettingRow {
  key: string;
  value: Json;
  group_name: string;
  label: string;
  updated_at: Timestamp;
  updated_by: UUID | null;
}

export interface BrandRow {
  id: UUID;
  slug: string;
  name: string;
  name_en: string | null;
  description: string | null;
  logo_url: string | null;
  image_url: string | null;
  active: boolean;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CategoryRow {
  id: UUID;
  slug: string;
  name: string;
  name_en: string | null;
  description: string | null;
  image_url: string | null;
  parent_id: UUID | null;
  active: boolean;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CollectionRow {
  id: UUID;
  slug: string;
  name: string;
  name_en: string | null;
  description: string | null;
  image_url: string | null;
  is_seasonal: boolean;
  active: boolean;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface FragranceFamilyRow {
  id: UUID;
  slug: string;
  name: string;
  name_en: string | null;
  description: string | null;
  image_url: string | null;
  active: boolean;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface FragranceNoteRow {
  id: UUID;
  slug: string;
  name: string;
  name_en: string | null;
  icon_url: string | null;
  active: boolean;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface DeliveryZoneRow {
  id: UUID;
  name: string;
  city: string;
  area: string | null;
  fee: Numeric;
  active: boolean;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProductRow {
  id: UUID;
  slug: string;
  name: string;
  name_ar: string | null;
  brand_id: UUID | null;
  family_id: UUID | null;
  gender: Gender | null;
  concentration: Concentration | null;
  season: Season | null;
  occasions: Occasion[];
  short_description: string | null;
  description: string | null;
  longevity: number | null;
  sillage: number | null;
  video_url: string | null;
  is_featured: boolean;
  is_new_arrival: boolean;
  is_best_seller: boolean;
  active: boolean;
  archived: boolean;
  sort_order: number;
  rating_avg: Numeric;
  rating_count: number;
  sales_count: number;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  inspiration_profile: string | null;
  art_field: 'ink' | 'paper' | 'pine' | 'gold' | 'char';
  freshness: number | null;
  sweetness: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  search_text: string;
}

export interface ProductVariantRow {
  id: UUID;
  product_id: UUID;
  size: Numeric;
  unit: string;
  sku: string | null;
  barcode: string | null;
  price: Numeric;
  compare_at_price: Numeric | null;
  stock_quantity: number;
  weight_grams: number | null;
  active: boolean;
  position: number;
  /** Units committed to open orders (on hand = stock_quantity + reserved_quantity). */
  reserved_quantity: number;
  stock_status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Public projection of a variant (no stock_quantity — column not granted to anon). */
export type ProductVariantPublic = Omit<
  ProductVariantRow,
  'stock_quantity' | 'barcode' | 'weight_grams' | 'sku' | 'reserved_quantity'
>;

export interface ProductImageRow {
  id: UUID;
  product_id: UUID;
  url: string;
  alt: string | null;
  is_primary: boolean;
  sort_order: number;
  created_at: Timestamp;
}

export interface ProductNoteRow {
  product_id: UUID;
  note_id: UUID;
  tier: NoteTier;
  position: number;
}

export interface ProductCategoryRow {
  product_id: UUID;
  category_id: UUID;
}
export interface ProductCollectionRow {
  product_id: UUID;
  collection_id: UUID;
}

export interface InventoryMovementRow {
  id: UUID;
  variant_id: UUID;
  previous_quantity: number;
  change: number;
  new_quantity: number;
  reason: InventoryReason;
  order_id: UUID | null;
  admin_id: UUID | null;
  note: string | null;
  created_at: Timestamp;
}

export interface OrderRow {
  id: UUID;
  public_order_number: string;
  customer_name: string;
  phone: string;
  whatsapp: string | null;
  city: string;
  area: string | null;
  address: string;
  delivery_note: string | null;
  delivery_zone_id: UUID | null;
  delivery_zone_name: string | null;
  subtotal: Numeric;
  discount_total: Numeric;
  delivery_fee: Numeric;
  gift_wrap: boolean;
  gift_wrap_fee: Numeric;
  gift_message: string | null;
  total: Numeric;
  coupon_id: UUID | null;
  coupon_code: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  internal_note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface OrderItemRow {
  id: UUID;
  order_id: UUID;
  product_id: UUID | null;
  variant_id: UUID | null;
  product_name_snapshot: string;
  variant_name_snapshot: string | null;
  size_snapshot: string | null;
  sku_snapshot: string | null;
  image_snapshot: string | null;
  unit_price_snapshot: Numeric;
  quantity: number;
  line_discount: Numeric;
  line_total: Numeric;
  created_at: Timestamp;
}

export interface OrderStatusHistoryRow {
  id: UUID;
  order_id: UUID;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string | null;
  changed_by: UUID | null;
  created_at: Timestamp;
}

export interface CouponRow {
  id: UUID;
  code: string;
  type: CouponType;
  value: Numeric;
  min_order_amount: Numeric;
  max_discount: Numeric | null;
  starts_at: Timestamp | null;
  ends_at: Timestamp | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  used_count: number;
  active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CouponUsageRow {
  id: UUID;
  coupon_id: UUID;
  order_id: UUID;
  phone: string;
  created_at: Timestamp;
}

export interface PromotionRow {
  id: UUID;
  title: string;
  kind: string;
  config: Json;
  starts_at: Timestamp | null;
  ends_at: Timestamp | null;
  active: boolean;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ReviewRow {
  id: UUID;
  product_id: UUID;
  rating: number;
  title: string | null;
  body: string | null;
  display_name: string | null;
  status: ReviewStatus;
  is_verified_purchase: boolean;
  order_id: UUID | null;
  device_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  approved_at: Timestamp | null;
  approved_by: UUID | null;
}

export interface WishlistItemRow {
  id: UUID;
  device_id: string;
  product_id: UUID;
  created_at: Timestamp;
}

export interface HomepageSectionRow {
  id: UUID;
  key: string;
  title: string;
  active: boolean;
  sort_order: number;
  config: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CmsBlockRow {
  id: UUID;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
  active: boolean;
  sort_order: number;
  starts_at: Timestamp | null;
  ends_at: Timestamp | null;
  config: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PageRow {
  slug: string;
  title: string;
  body: string;
  is_placeholder: boolean;
  approved: boolean;
  noindex: boolean;
  active: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface FaqRow {
  id: UUID;
  question: string;
  answer: string;
  active: boolean;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AnalyticsEventRow {
  id: number;
  event_type: string;
  product_id: UUID | null;
  session_id: string | null;
  meta: Json;
  created_at: Timestamp;
}

export interface AdminAuditLogRow {
  id: number;
  admin_id: UUID | null;
  action: string;
  entity: string;
  entity_id: string | null;
  previous_value: Json;
  new_value: Json;
  reason: string | null;
  created_at: Timestamp;
}

export interface NotificationLogRow {
  id: UUID;
  order_id: UUID | null;
  channel: string;
  event: string;
  status: string;
  payload: Json;
  created_at: Timestamp;
}

export interface IdempotencyKeyRow {
  key: string;
  order_id: UUID | null;
  created_at: Timestamp;
}

type TableDef<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      admin_users: TableDef<AdminUserRow>;
      site_settings: TableDef<SiteSettingRow>;
      brands: TableDef<BrandRow>;
      categories: TableDef<CategoryRow>;
      collections: TableDef<CollectionRow>;
      fragrance_families: TableDef<FragranceFamilyRow>;
      fragrance_notes: TableDef<FragranceNoteRow>;
      delivery_zones: TableDef<DeliveryZoneRow>;
      products: TableDef<ProductRow>;
      product_variants: TableDef<ProductVariantRow>;
      product_images: TableDef<ProductImageRow>;
      product_notes: TableDef<ProductNoteRow>;
      product_categories: TableDef<ProductCategoryRow>;
      product_collections: TableDef<ProductCollectionRow>;
      inventory_movements: TableDef<InventoryMovementRow>;
      orders: TableDef<OrderRow>;
      order_items: TableDef<OrderItemRow>;
      order_status_history: TableDef<OrderStatusHistoryRow>;
      idempotency_keys: TableDef<IdempotencyKeyRow>;
      coupons: TableDef<CouponRow>;
      coupon_usage: TableDef<CouponUsageRow>;
      promotions: TableDef<PromotionRow>;
      reviews: TableDef<ReviewRow>;
      wishlist_items: TableDef<WishlistItemRow>;
      homepage_sections: TableDef<HomepageSectionRow>;
      cms_blocks: TableDef<CmsBlockRow>;
      pages: TableDef<PageRow>;
      faqs: TableDef<FaqRow>;
      analytics_events: TableDef<AnalyticsEventRow>;
      admin_audit_logs: TableDef<AdminAuditLogRow>;
      notification_logs: TableDef<NotificationLogRow>;
      rate_limit_buckets: TableDef<{ key: string; window_start: Timestamp; hits: number }>;
    };
    Views: Record<string, never>;
    Functions: {
      quote_order: {
        Args: { p_items: Json; p_zone?: string; p_code?: string; p_phone?: string };
        Returns: Json;
      };
      quote_order_v2: { Args: { p_payload: Json }; Returns: Json };
      create_order: { Args: { p_payload: Json; p_idempotency_key: string }; Returns: Json };
      rate_limit_hit: { Args: { p_key: string; p_limit: number; p_window_seconds: number }; Returns: Json };
      expire_stale_orders: { Args: { p_hours?: number | null }; Returns: number };
      is_senior_admin: { Args: Record<string, never>; Returns: boolean };
      track_order: { Args: { p_number: string; p_phone: string }; Returns: Json };
      get_order_public: { Args: { p_order_id: string }; Returns: Json };
      admin_update_order_status: {
        Args: { p_order_id: string; p_to: OrderStatus; p_note?: string; p_override?: boolean };
        Returns: Json;
      };
      adjust_inventory: {
        Args: {
          p_variant_id: string;
          p_change: number;
          p_reason: InventoryReason;
          p_order_id?: string;
          p_admin_id?: string;
          p_note?: string;
        };
        Returns: number;
      };
      search_products: { Args: { p_query: string; p_limit?: number }; Returns: unknown[] };
      get_setting: { Args: { p_key: string }; Returns: Json };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_owner: { Args: Record<string, never>; Returns: boolean };
      has_permission: { Args: { perm: string }; Returns: boolean };
      list_products: {
        Args: { p_filters?: Json; p_sort?: string; p_limit?: number; p_offset?: number };
        Returns: Json;
      };
      browse_facets: { Args: Record<string, never>; Returns: Json };
      // ---- admin RPCs (0015) ----
      log_admin_action: {
        Args: {
          p_action: string;
          p_entity: string;
          p_entity_id?: string | null;
          p_previous?: Json;
          p_new?: Json;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      admin_adjust_inventory: {
        Args: { p_variant_id: string; p_change: number; p_reason: InventoryReason; p_note?: string | null };
        Returns: number;
      };
      admin_delete_product: { Args: { p_product_id: string; p_confirm_name: string }; Returns: Json };
      admin_dashboard_metrics: { Args: Record<string, never>; Returns: Json };
      admin_sales_series: { Args: { p_days?: number }; Returns: Json };
      admin_top_products: { Args: { p_limit?: number }; Returns: Json };
      admin_orders_by_city: { Args: Record<string, never>; Returns: Json };
      admin_customers: {
        Args: { p_search?: string | null; p_limit?: number; p_offset?: number };
        Returns: Json;
      };
    };
    Enums: {
      order_status: OrderStatus;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      product_gender: Gender;
      concentration: Concentration;
      season: Season;
      occasion: Occasion;
      note_tier: NoteTier;
      inventory_reason: InventoryReason;
      review_status: ReviewStatus;
      coupon_type: CouponType;
      admin_role: AdminRole;
    };
  };
}
