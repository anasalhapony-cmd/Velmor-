-- =============================================================================
-- 0023 — Permanent product deletion (admin_delete_product)
-- =============================================================================
-- Archiving (products.archived) hides a perfume but keeps it. This adds the
-- irreversible option: remove a perfume from the store entirely.
--
-- What "entirely" means (decided by the existing foreign keys, verified by the
-- DB tests):
--   removed  : the product, its sizes (variants), images rows, notes, category /
--              collection links, reviews, wishlist entries, coupon product
--              scopes, and the inventory ledger of its sizes
--   kept     : every order. order_items snapshot name / size / sku / price /
--              image, and their product_id / variant_id are set NULL by the
--              FKs, so order history, totals and revenue never change
--   cleared  : site_settings.home_signature_product if it pointed at this slug
--
-- Safety rails, all enforced HERE (not only in the UI):
--   * owner / admin only (is_senior_admin) — a `manager` holding manage_products
--     can archive, not destroy
--   * refuses while any order for the product is still open (new, confirmed,
--     preparing, ready, out for delivery, failed-awaiting-retry) or any size has
--     reserved stock — those customers are still owed the perfume
--   * the caller must type the perfume's exact name (typo / mis-click guard)
--   * serialised against order creation: create_order locks the size rows
--     FOR UPDATE, and so does this function, so an order cannot slip in between
--     the "no open orders" check and the delete
--   * a full snapshot (row, sizes, image URLs, counts) goes to admin_audit_logs
--
-- Returns the deleted slug / name / image URLs so the caller can clean up the
-- storage objects (a SQL function cannot reach Supabase Storage).

create or replace function admin_delete_product(
  p_product_id   uuid,
  p_confirm_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod     products%rowtype;
  v_open     int;
  v_reserved int;
  v_images   jsonb;
  v_variants jsonb;
  v_counts   jsonb;
  v_typed    text;
begin
  if not (is_admin() and is_senior_admin() and has_permission('manage_products')) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  -- Serialise with create_order (it locks size rows FOR UPDATE), then the product.
  perform 1 from product_variants where product_id = p_product_id order by id for update;
  select * into v_prod from products where id = p_product_id for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Typed-name confirmation (case / extra-space insensitive; Arabic or Latin name).
  v_typed := lower(regexp_replace(btrim(coalesce(p_confirm_name, '')), '\s+', ' ', 'g'));
  if v_typed = ''
     or v_typed not in (
          lower(regexp_replace(btrim(coalesce(v_prod.name_ar, '')), '\s+', ' ', 'g')),
          lower(regexp_replace(btrim(v_prod.name), '\s+', ' ', 'g'))
        ) then
    raise exception 'CONFIRMATION_MISMATCH' using errcode = 'P0010';
  end if;

  -- Customers still waiting for this perfume block the deletion.
  select count(distinct o.id) into v_open
    from order_items oi
    join orders o on o.id = oi.order_id
   where oi.product_id = p_product_id
     and order_status_is_open(o.order_status);
  if v_open > 0 then
    raise exception 'HAS_OPEN_ORDERS' using errcode = 'P0011', detail = v_open::text;
  end if;

  select coalesce(sum(reserved_quantity), 0) into v_reserved
    from product_variants where product_id = p_product_id;
  if v_reserved > 0 then
    raise exception 'HAS_RESERVED_STOCK' using errcode = 'P0011', detail = v_reserved::text;
  end if;

  -- Snapshot for the audit trail (taken before anything is removed).
  select coalesce(jsonb_agg(url order by sort_order), '[]'::jsonb) into v_images
    from product_images where product_id = p_product_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'size', size, 'unit', unit, 'sku', sku,
           'price', price, 'stock_quantity', stock_quantity) order by size), '[]'::jsonb) into v_variants
    from product_variants where product_id = p_product_id;
  v_counts := jsonb_build_object(
    'reviews',        (select count(*) from reviews where product_id = p_product_id),
    'wishlist_items', (select count(*) from wishlist_items where product_id = p_product_id),
    'orders_kept',    (select count(distinct order_id) from order_items where product_id = p_product_id)
  );

  -- Don't leave the homepage pointing at a perfume that no longer exists.
  update site_settings
     set value = '""'::jsonb
   where key = 'home_signature_product' and value = to_jsonb(v_prod.slug);

  -- Children go with it via ON DELETE CASCADE; order_items.* are set NULL.
  delete from products where id = p_product_id;

  insert into admin_audit_logs (admin_id, action, entity, entity_id, previous_value, new_value, reason)
  values (auth.uid(), 'delete', 'products', p_product_id::text,
          to_jsonb(v_prod) || jsonb_build_object('variants', v_variants, 'images', v_images),
          v_counts, 'permanent_delete');

  return jsonb_build_object(
    'id',     p_product_id,
    'slug',   v_prod.slug,
    'name',   coalesce(nullif(v_prod.name_ar, ''), v_prod.name),
    'images', v_images,
    'counts', v_counts
  );
end;
$$;

-- Self-guarding (raises 42501 unless a senior admin), so signed-in users may call it;
-- anon and PUBLIC may not (0019 stops new functions being auto-exposed, but be explicit).
revoke all on function admin_delete_product(uuid, text) from public, anon;
grant execute on function admin_delete_product(uuid, text) to authenticated, service_role;
