-- =============================================================================
-- DB integration assertions. Run against a fresh migrated DB (see run-db-tests.sh).
-- Uses plpgsql ASSERT; any failure aborts with a clear message.
-- =============================================================================
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- PART 1 — Seed + business-logic assertions (as superuser; RLS bypassed)
-- ---------------------------------------------------------------------------
do $$
declare
  v_brand uuid; v_fam uuid; v_zone uuid; v_zone2 uuid;
  v_prod uuid; v_v50 uuid; v_v100 uuid;
  v_admin uuid;
  v_res jsonb; v_res2 jsonb;
  v_num text; v_num2 text;
  v_stock int;
begin
  -- seed taxonomy
  insert into brands (slug, name) values ('velmor','فيلمور') returning id into v_brand;
  insert into fragrance_families (slug, name) values ('woody','خشبية') returning id into v_fam;
  insert into delivery_zones (name, city, fee) values ('وسط بنغازي','بنغازي', 10) returning id into v_zone;
  insert into delivery_zones (name, city, fee) values ('ضواحي','بنغازي', 15) returning id into v_zone2;

  -- seed product + variants
  insert into products (slug, name, name_ar, brand_id, family_id, gender, concentration, season, active)
    values ('velmor-noir','VELMOR NOIR','فيلمور نوار', v_brand, v_fam, 'MEN','EAU_DE_PARFUM','WINTER', true)
    returning id into v_prod;
  insert into product_variants (product_id, size, unit, price, compare_at_price, stock_quantity)
    values (v_prod, 50,'ml', 150, 200, 20) returning id into v_v50;
  insert into product_variants (product_id, size, unit, price, stock_quantity)
    values (v_prod, 100,'ml', 250, 5) returning id into v_v100;
  insert into product_images (product_id, url, is_primary) values (v_prod, 'https://x/y.jpg', true);

  -- admin user (owner)
  insert into auth.users (id, email) values (gen_random_uuid(), 'owner@velmor.ly') returning id into v_admin;
  insert into admin_users (id, full_name, role, active) values (v_admin,'Owner','owner', true);

  -- ---- quote_order ----
  v_res := quote_order(
    jsonb_build_array(jsonb_build_object('variant_id', v_v50,'quantity',2)),
    v_zone, null, null);
  assert (v_res->>'subtotal')::numeric = 300, 'quote subtotal should be 300, got ' || (v_res->>'subtotal');
  assert (v_res->>'delivery_fee')::numeric = 10, 'quote fee should be 10';
  assert (v_res->>'total')::numeric = 310, 'quote total should be 310';
  assert (v_res->>'ok')::boolean, 'quote should be ok';

  -- ---- create_order (success) : price authority + totals ----
  v_res := create_order(jsonb_build_object(
      'customer_name','أحمد','phone','218911111111','city','بنغازي','address','شارع 1',
      'delivery_zone_id', v_zone,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v50,'quantity',2))
    ), 'idem-key-1');
  v_num := v_res->>'order_number';
  assert v_num like 'VEL-%', 'order number format';
  assert (v_res->>'subtotal')::numeric = 300, 'order subtotal 300';
  assert (v_res->>'total')::numeric = 310, 'order total 310';
  select stock_quantity into v_stock from product_variants where id = v_v50;
  assert v_stock = 18, 'stock should drop 20->18, got ' || v_stock;
  assert exists(select 1 from inventory_movements where order_id=(select id from orders where public_order_number=v_num) and reason='SALE'), 'SALE movement recorded';

  -- ---- idempotency: same key returns same order, no double decrement ----
  v_res2 := create_order(jsonb_build_object(
      'customer_name','أحمد','phone','218911111111','city','بنغازي','address','شارع 1',
      'delivery_zone_id', v_zone,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v50,'quantity',2))
    ), 'idem-key-1');
  assert (v_res2->>'order_number') = v_num, 'idempotent: same order number';
  select stock_quantity into v_stock from product_variants where id = v_v50;
  assert v_stock = 18, 'idempotent: stock unchanged at 18, got ' || v_stock;

  -- ---- out of stock rejected ----
  begin
    perform create_order(jsonb_build_object(
      'customer_name','x','phone','218922222222','city','بنغازي','address','y',
      'delivery_zone_id', v_zone,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v100,'quantity',8))
    ), 'idem-oos');
    assert false, 'expected OUT_OF_STOCK';
  exception when others then
    assert sqlerrm like 'OUT_OF_STOCK%', 'expected OUT_OF_STOCK, got: ' || sqlerrm;
  end;
  -- stock of v100 untouched (rollback)
  select stock_quantity into v_stock from product_variants where id = v_v100;
  assert v_stock = 5, 'v100 stock unchanged after failed order, got ' || v_stock;

  -- ---- coupon: percentage + min order + usage limit ----
  insert into coupons (code, type, value, min_order_amount, usage_limit, per_customer_limit)
    values ('WELCOME10','PERCENTAGE', 10, 100, 1, 1);
  v_res := quote_order(
    jsonb_build_array(jsonb_build_object('variant_id', v_v50,'quantity',2)), v_zone, 'WELCOME10', '218933333333');
  assert (v_res->>'discount')::numeric = 30, 'coupon 10% of 300 = 30, got ' || (v_res->>'discount');
  assert (v_res->>'total')::numeric = 280, 'coupon total = 300-30+10 = 280';

  -- min order not met
  insert into coupons (code, type, value, min_order_amount) values ('BIG','FIXED', 50, 100000);
  v_res := quote_order(jsonb_build_array(jsonb_build_object('variant_id', v_v50,'quantity',1)), v_zone, 'BIG', null);
  assert (v_res->>'discount')::numeric = 0, 'below min order -> no discount';
  assert (v_res->'coupon'->>'valid')::boolean = false, 'coupon invalid below min';

  -- create order using coupon, then usage limit blocks second use
  v_res := create_order(jsonb_build_object(
      'customer_name','ب','phone','218944444444','city','بنغازي','address','ز',
      'delivery_zone_id', v_zone, 'coupon_code','WELCOME10',
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v50,'quantity',2))
    ), 'idem-coupon-1');
  assert (v_res->>'discount_total')::numeric = 30, 'order used coupon discount 30';
  assert (select used_count from coupons where code='WELCOME10') = 1, 'coupon used_count incremented';
  -- second use exceeds usage_limit(1) -> coupon dropped, full price
  v_res := create_order(jsonb_build_object(
      'customer_name','ج','phone','218955555555','city','بنغازي','address','ح',
      'delivery_zone_id', v_zone, 'coupon_code','WELCOME10',
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v50,'quantity',2))
    ), 'idem-coupon-2');
  assert (v_res->>'discount_total')::numeric = 0, 'coupon over usage limit -> no discount';

  -- ---- status transitions + inventory restore exactly once ----
  set local request.jwt.claim.sub = '';  -- reset
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  select stock_quantity into v_stock from product_variants where id = v_v50; -- current after 3 sales of 2 = 20-2-2-2=14
  assert v_stock = 14, 'stock after three 2-unit orders should be 14, got ' || v_stock;

  -- invalid transition rejected
  begin
    perform admin_update_order_status((select id from orders where public_order_number=v_num), 'DELIVERED', null, false);
    assert false, 'expected INVALID_TRANSITION (PENDING->DELIVERED)';
  exception when others then
    assert sqlerrm like 'INVALID_TRANSITION%', 'expected INVALID_TRANSITION, got ' || sqlerrm;
  end;

  -- valid path then cancel restores stock exactly once
  perform admin_update_order_status((select id from orders where public_order_number=v_num), 'CONFIRMED', null, false);
  perform admin_update_order_status((select id from orders where public_order_number=v_num), 'CANCELLED', 'customer changed mind', false);
  select stock_quantity into v_stock from product_variants where id = v_v50;
  assert v_stock = 16, 'cancel restores 2 units: 14->16, got ' || v_stock;
  -- a cancelled order is final: even an owner override cannot re-open or
  -- re-cancel it (that would corrupt stock), and stock is not restored twice
  begin
    perform admin_update_order_status((select id from orders where public_order_number=v_num), 'EXPIRED', 'force', true);
    assert false, 'expected ORDER_FINALIZED when leaving CANCELLED';
  exception when others then
    assert sqlerrm like 'ORDER_FINALIZED%', 'expected ORDER_FINALIZED, got ' || sqlerrm;
  end;
  select stock_quantity into v_stock from product_variants where id = v_v50;
  assert v_stock = 16, 'no double restore: still 16, got ' || v_stock;

  -- ---- track_order requires number + phone ----
  v_res := track_order(v_num, '218911111111');
  assert v_res is not null, 'track with correct phone returns order';
  assert (v_res->>'order_number') = v_num, 'tracked order number matches';
  assert v_res ? 'internal_note' = false, 'tracking must NOT expose internal_note';
  assert track_order(v_num, '000') is null, 'wrong phone -> null (no enumeration)';
  assert track_order('VEL-NOPE1', '218911111111') is null, 'wrong number -> null';

  raise notice 'PART 1 (business logic): ALL ASSERTIONS PASSED';
end $$;

-- ---------------------------------------------------------------------------
-- PART 2 — RLS assertions (as the public 'anon' role)
-- ---------------------------------------------------------------------------
-- add an inactive product + a pending review to prove filtering
insert into products (slug, name, active) values ('hidden','HIDDEN', false);
insert into reviews (product_id, rating, status)
  select id, 5, 'PENDING' from products where slug='velmor-noir';
insert into reviews (product_id, rating, status)
  select id, 4, 'APPROVED' from products where slug='velmor-noir';

do $$
declare v_cnt int; v_ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;

  -- only active, non-archived products are visible
  select count(*) into v_cnt from products;
  assert v_cnt = 1, 'anon should see exactly 1 active product, got ' || v_cnt;

  -- only APPROVED reviews visible
  select count(*) into v_cnt from reviews;
  assert v_cnt = 1, 'anon should see only 1 approved review, got ' || v_cnt;

  -- anon cannot read exact stock (column not granted)
  begin
    perform stock_quantity from product_variants limit 1;
    assert false, 'anon must NOT read stock_quantity';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- but the stock bucket IS readable
  perform stock_status from product_variants limit 1;

  -- anon cannot read orders at all
  begin
    perform 1 from orders limit 1;
    assert false, 'anon must NOT read orders';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- anon cannot read coupons
  begin
    perform 1 from coupons limit 1;
    assert false, 'anon must NOT read coupons';
  exception when insufficient_privilege then
    null;
  end;

  reset role;
  raise notice 'PART 2 (RLS): ALL ASSERTIONS PASSED';
end $$;

-- ---------------------------------------------------------------------------
-- PART 3 — Admin RPCs (0015) as the owner (authenticated role + jwt sub)
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_var uuid;
  v_prev int; v_new int;
  v_metrics jsonb;
  v_cust jsonb;
  v_before int; v_after int;
begin
  select id into v_admin from admin_users where role = 'owner' limit 1;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;

  -- log_admin_action appends exactly one row
  select count(*) into v_before from admin_audit_logs;
  perform log_admin_action('test', 'products', null, null, jsonb_build_object('x', 1), 'unit test');
  select count(*) into v_after from admin_audit_logs;
  assert v_after = v_before + 1, 'log_admin_action should append one audit row';

  -- admin_adjust_inventory changes stock atomically + writes ledger
  select id into v_var from product_variants order by created_at limit 1;
  select stock_quantity into v_prev from product_variants where id = v_var;
  v_new := admin_adjust_inventory(v_var, 5, 'RESTOCK', 'unit test restock');
  assert v_new = v_prev + 5, 'admin_adjust_inventory should add 5, got ' || v_new;
  assert exists(select 1 from inventory_movements where variant_id = v_var and reason = 'RESTOCK'),
    'RESTOCK movement recorded';

  -- reserved reasons (SALE/CANCELLATION) are rejected for manual adjust
  begin
    perform admin_adjust_inventory(v_var, -1, 'SALE', null);
    assert false, 'SALE reason must be rejected for manual adjust';
  exception when others then
    assert sqlerrm like 'RESERVED_REASON%', 'expected RESERVED_REASON, got ' || sqlerrm;
  end;

  -- dashboard metrics + customers aggregate return sane shapes
  v_metrics := admin_dashboard_metrics();
  assert (v_metrics->>'orders_total')::int >= 1, 'metrics orders_total should be >= 1';
  assert v_metrics ? 'revenue_realised', 'metrics must include revenue_realised';
  assert v_metrics ? 'low_stock', 'metrics must include low_stock';

  v_cust := admin_customers(null, 10, 0);
  assert (v_cust->>'total')::int >= 1, 'customers total should be >= 1';

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'PART 3 (admin RPCs): ALL ASSERTIONS PASSED';
end $$;

-- A logged-in NON-admin must be refused by the internal guards (42501).
do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  begin
    perform admin_dashboard_metrics();
    assert false, 'non-admin must be refused from admin_dashboard_metrics';
  exception when insufficient_privilege then
    null; -- expected: NOT_AUTHORIZED (42501)
  end;
  reset role;
  raise notice 'PART 3b (authz): non-admin correctly refused';
end $$;

-- ---------------------------------------------------------------------------
-- PART 4 — Notification outbox (0016): every order creation queues a row
-- ---------------------------------------------------------------------------
do $$
declare v_cnt int;
begin
  select count(*) into v_cnt from notification_logs where event = 'order_received' and status = 'QUEUED';
  assert v_cnt >= 1, 'expected >=1 queued order_received notification, got ' || v_cnt;
  raise notice 'PART 4 (notifications outbox): ALL ASSERTIONS PASSED (% queued)', v_cnt;
end $$;

-- ---------------------------------------------------------------------------
-- PART 5 — Phase 2 (0017/0018): reservations, gift wrap, coupons, roles,
--          payment methods, prefixes, rate limiting, browse v2, auto-expiry
-- ---------------------------------------------------------------------------
do $$
declare
  v_zone uuid; v_prod uuid; v_v uuid; v_v100 uuid;
  v_owner uuid; v_mgr uuid; v_adm uuid;
  v_res jsonb; v_num text; v_oid uuid;
  v_stock int; v_res_q int; v_n int;
  v_list jsonb;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  insert into delivery_zones (name, city, fee) values ('مصراتة','مصراتة', 25) returning id into v_zone;
  insert into products (slug, name, name_ar, gender, active, art_field)
    values ('p2-test','P2 TEST','اختبار', 'MEN', true, 'pine') returning id into v_prod;
  insert into product_variants (product_id, size, unit, price, stock_quantity)
    values (v_prod, 50, 'ml', 100, 10) returning id into v_v;
  insert into product_variants (product_id, size, unit, price, stock_quantity)
    values (v_prod, 100, 'ml', 180, 4) returning id into v_v100;

  select id into v_owner from admin_users where role = 'owner' limit 1;

  -- ---- reservation lifecycle: order -> reserved; delivered -> released ----
  v_res := create_order(jsonb_build_object(
      'customer_name','س','phone','218910000001','city','مدينة مزيفة','address','ع',
      'delivery_zone_id', v_zone,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v,'quantity',3))), 'p2-idem-1');
  v_num := v_res->>'order_number';
  select id into v_oid from orders where public_order_number = v_num;
  select stock_quantity, reserved_quantity into v_stock, v_res_q from product_variants where id = v_v;
  assert v_stock = 7 and v_res_q = 3, format('after order: stock 7/reserved 3, got %s/%s', v_stock, v_res_q);
  assert (select city from orders where id = v_oid) = 'مصراتة', 'city must come from the delivery zone';
  assert exists (select 1 from analytics_events where event_type = 'order_created'
                 and meta->>'order_number' = v_num), 'order_created analytics event';

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform admin_update_order_status(v_oid, 'CONFIRMED');
  perform admin_update_order_status(v_oid, 'PREPARING');
  perform admin_update_order_status(v_oid, 'READY_FOR_DELIVERY');
  perform admin_update_order_status(v_oid, 'OUT_FOR_DELIVERY');
  select reserved_quantity into v_res_q from product_variants where id = v_v;
  assert v_res_q = 3, 'still reserved while out for delivery';
  perform admin_update_order_status(v_oid, 'DELIVERED');
  select stock_quantity, reserved_quantity into v_stock, v_res_q from product_variants where id = v_v;
  assert v_stock = 7 and v_res_q = 0, format('delivered: stock 7/reserved 0, got %s/%s', v_stock, v_res_q);
  assert (select payment_status from orders where id = v_oid) = 'PAID', 'COD paid on delivery';
  begin
    perform admin_update_order_status(v_oid, 'CANCELLED', null, true);
    assert false, 'delivered order must be final';
  exception when others then
    assert sqlerrm like 'ORDER_FINALIZED%', 'expected ORDER_FINALIZED, got ' || sqlerrm;
  end;

  -- ---- cancel releases reservation + restores stock ----
  perform set_config('request.jwt.claim.sub', '', true);
  v_res := create_order(jsonb_build_object(
      'customer_name','ص','phone','218910000002','city','x','address','ع',
      'delivery_zone_id', v_zone,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v,'quantity',2))), 'p2-idem-2');
  select id into v_oid from orders where public_order_number = v_res->>'order_number';
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform admin_update_order_status(v_oid, 'CANCELLED', 'test');
  select stock_quantity, reserved_quantity into v_stock, v_res_q from product_variants where id = v_v;
  assert v_stock = 7 and v_res_q = 0, format('cancelled: stock 7/reserved 0, got %s/%s', v_stock, v_res_q);

  -- ---- gift wrap: ignored while disabled, charged from settings when on ----
  perform set_config('request.jwt.claim.sub', '', true);
  v_res := create_order(jsonb_build_object(
      'customer_name','ض','phone','218910000003','city','x','address','ع',
      'delivery_zone_id', v_zone, 'gift_wrap', true, 'gift_message', 'hi',
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v,'quantity',1))), 'p2-idem-3');
  assert (v_res->>'gift_wrap')::boolean = false and (v_res->>'gift_wrap_fee')::numeric = 0,
    'gift wrap must be ignored while disabled';
  assert (v_res->>'total')::numeric = 125, 'total 100 + 25 delivery, got ' || (v_res->>'total');

  insert into site_settings (key, value, group_name) values ('gift_wrapping_enabled','true','features')
    on conflict (key) do update set value = 'true';
  insert into site_settings (key, value, group_name) values ('gift_wrapping_fee','5','features')
    on conflict (key) do update set value = '5';
  v_res := quote_order_v2(jsonb_build_object('delivery_zone_id', v_zone, 'gift_wrap', true,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v,'quantity',1))));
  assert (v_res->>'gift_wrap_fee')::numeric = 5 and (v_res->>'total')::numeric = 130, 'quote_v2 gift total 130';
  v_res := create_order(jsonb_build_object(
      'customer_name','ط','phone','218910000004','city','x','address','ع',
      'delivery_zone_id', v_zone, 'gift_wrap', true, 'gift_wrap_fee', 0.001, 'total', 1,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v,'quantity',1, 'price', 1))), 'p2-idem-4');
  assert (v_res->>'gift_wrap_fee')::numeric = 5, 'server fee wins over client-sent fee';
  assert (v_res->>'total')::numeric = 130, 'server total 130 despite client total 1, got ' || (v_res->>'total');
  update site_settings set value = 'false' where key = 'gift_wrapping_enabled';

  -- ---- coupon use released when the order is cancelled ----
  insert into coupons (code, type, value, usage_limit) values ('ONCE','FIXED', 10, 1);
  v_res := create_order(jsonb_build_object(
      'customer_name','ظ','phone','218910000005','city','x','address','ع',
      'delivery_zone_id', v_zone, 'coupon_code', 'ONCE',
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v,'quantity',1))), 'p2-idem-5');
  assert (v_res->>'discount_total')::numeric = 10, 'coupon applied';
  assert (select used_count from coupons where code = 'ONCE') = 1, 'coupon used once';
  select id into v_oid from orders where public_order_number = v_res->>'order_number';
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform admin_update_order_status(v_oid, 'CANCELLED');
  assert (select used_count from coupons where code = 'ONCE') = 0, 'cancel releases coupon use';
  assert not exists (select 1 from coupon_usage where order_id = v_oid), 'usage row removed';
  perform set_config('request.jwt.claim.sub', '', true);

  -- ---- payment methods + quantity bounds ----
  begin
    perform create_order(jsonb_build_object(
      'customer_name','ع','phone','218910000006','city','x','address','ع',
      'delivery_zone_id', v_zone, 'payment_method', 'CARD',
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v,'quantity',1))), 'p2-idem-6');
    assert false, 'CARD must be refused while only COD is enabled';
  exception when others then
    assert sqlerrm = 'PAYMENT_METHOD_DISABLED', 'expected PAYMENT_METHOD_DISABLED, got ' || sqlerrm;
  end;
  begin
    perform create_order(jsonb_build_object(
      'customer_name','غ','phone','218910000007','city','x','address','ع',
      'delivery_zone_id', v_zone,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v,'quantity',-2))), 'p2-idem-7');
    assert false, 'negative quantity must be refused';
  exception when others then
    assert sqlerrm = 'INVALID_QUANTITY', 'expected INVALID_QUANTITY, got ' || sqlerrm;
  end;
  select stock_quantity into v_stock from product_variants where id = v_v;
  assert v_stock = 5, 'refused orders leave stock untouched (7-1-1=5), got ' || v_stock;

  -- ---- order prefix setting ----
  insert into site_settings (key, value, group_name) values ('order_prefix','"vlm"','general')
    on conflict (key) do update set value = '"vlm"';
  v_res := create_order(jsonb_build_object(
      'customer_name','ف','phone','218910000008','city','x','address','ع',
      'delivery_zone_id', v_zone,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v,'quantity',1))), 'p2-idem-8');
  assert (v_res->>'order_number') ~ '^VLM-[A-Z2-9]{6}$', 'prefix VLM, got ' || (v_res->>'order_number');
  update site_settings set value = '"VEL"' where key = 'order_prefix';

  -- ---- roles: admin has all store perms; manager cannot override ----
  insert into auth.users (id, email) values (gen_random_uuid(), 'mgr@velmor.ly') returning id into v_mgr;
  insert into admin_users (id, full_name, role, permissions, active)
    values (v_mgr, 'Mgr', 'manager', array['manage_orders'], true);
  insert into auth.users (id, email) values (gen_random_uuid(), 'adm@velmor.ly') returning id into v_adm;
  insert into admin_users (id, full_name, role, active) values (v_adm, 'Adm', 'admin', true);

  perform set_config('request.jwt.claim.sub', v_adm::text, true);
  assert has_permission('manage_inventory') and has_permission('manage_settings'), 'admin role has store perms';
  assert not is_owner(), 'admin is not owner';

  select id into v_oid from orders where public_order_number = v_res->>'order_number';
  perform set_config('request.jwt.claim.sub', v_mgr::text, true);
  assert not has_permission('manage_inventory'), 'manager limited to granted perms';
  begin
    perform admin_update_order_status(v_oid, 'DELIVERED', 'skip ahead', true);
    assert false, 'manager must not force overrides';
  exception when others then
    assert sqlerrm = 'OVERRIDE_NOT_ALLOWED', 'expected OVERRIDE_NOT_ALLOWED, got ' || sqlerrm;
  end;
  perform admin_update_order_status(v_oid, 'CONFIRMED');  -- normal transition allowed
  perform set_config('request.jwt.claim.sub', '', true);

  -- ---- auto-expiry restores stock ----
  v_res := create_order(jsonb_build_object(
      'customer_name','ق','phone','218910000009','city','x','address','ع',
      'delivery_zone_id', v_zone,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_v100,'quantity',2))), 'p2-idem-9');
  update orders set created_at = now() - interval '5 hours' where public_order_number = v_res->>'order_number';
  assert expire_stale_orders(0) = 0, 'expiry disabled with 0h';
  v_n := expire_stale_orders(3);
  assert v_n >= 1, 'at least one stale order expired, got ' || v_n;
  assert (select order_status from orders where public_order_number = v_res->>'order_number') = 'EXPIRED', 'expired';
  select stock_quantity, reserved_quantity into v_stock, v_res_q from product_variants where id = v_v100;
  assert v_stock = 4 and v_res_q = 0, format('expiry restores: 4/0, got %s/%s', v_stock, v_res_q);

  -- ---- rate limiting (fixed window) ----
  assert (rate_limit_hit('t:1', 2, 60)->>'allowed')::boolean, 'hit 1 allowed';
  assert (rate_limit_hit('t:1', 2, 60)->>'allowed')::boolean, 'hit 2 allowed';
  assert not (rate_limit_hit('t:1', 2, 60)->>'allowed')::boolean, 'hit 3 blocked';
  update rate_limit_buckets set window_start = now() - interval '2 minutes' where key = 't:1';
  assert (rate_limit_hit('t:1', 2, 60)->>'allowed')::boolean, 'window resets';

  -- ---- browse v2: size filter + rich card fields ----
  v_list := list_products(jsonb_build_object('sizes', jsonb_build_array('100'), 'q', 'P2'), 'recommended', 12, 0);
  assert (v_list->>'total')::int = 1, 'size filter finds the 100ml product';
  assert (v_list->'items'->0->>'art_field') = 'pine', 'art_field exposed';
  assert jsonb_array_length(v_list->'items'->0->'variants') = 2, 'variants exposed for quick add';
  assert (v_list->'items'->0->'variants'->0) ? 'stock_status'
     and not ((v_list->'items'->0->'variants'->0) ? 'stock_quantity'), 'no exact stock in listing';
  v_list := list_products(jsonb_build_object('sizes', jsonb_build_array('150'), 'q', 'P2'), 'popularity', 12, 0);
  assert (v_list->>'total')::int = 0, 'no 150ml variant -> no match';

  raise notice 'PART 5 (phase 2 commerce): ALL ASSERTIONS PASSED';
end $$;

-- PART 5b — privileges for new objects as anon
do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform rate_limit_hit('x', 1, 1);
    assert false, 'anon must not call rate_limit_hit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from rate_limit_buckets;
    assert false, 'anon must not read rate_limit_buckets';
  exception when insufficient_privilege then null;
  end;
  begin
    perform expire_stale_orders(1);
    assert false, 'anon must not expire orders';
  exception when insufficient_privilege then null;
  end;
  begin
    perform reserved_quantity from product_variants limit 1;
    assert false, 'anon must not read reserved_quantity';
  exception when insufficient_privilege then null;
  end;
  begin
    perform _transition_order_status(gen_random_uuid(), 'CANCELLED', null, null, true);
    assert false, 'anon must not call internal transition';
  exception when insufficient_privilege then null;
  end;
  -- quote/track are server-only (rate-limited routes) since 0019
  begin
    perform quote_order_v2('{"items": []}'::jsonb);
    assert false, 'anon must not call quote_order_v2 directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform track_order('VEL-000000', '218910000000');
    assert false, 'anon must not call track_order directly';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PART 5b (phase 2 privileges): ALL ASSERTIONS PASSED';
end $$;


-- PART 6 — exhaustive privilege surface (mirrors Supabase default privileges)
do $$
declare
  v_bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in ('is_admin','is_owner','is_senior_admin','has_permission','get_setting',
                           'order_status_is_open','search_products','list_products','browse_facets');
  assert v_bad is null, 'anon can execute non-allowlisted functions: ' || v_bad;

  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname in ('create_order','adjust_inventory','get_order_public','gen_order_number',
                       '_transition_order_status','expire_stale_orders','rate_limit_hit');
  assert v_bad is null, 'authenticated can execute server-only functions: ' || v_bad;

  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update')
          or has_table_privilege('anon', c.oid, 'delete'));
  assert v_bad is null, 'anon has write privileges on: ' || v_bad;

  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  assert v_bad is null, 'RLS disabled on: ' || v_bad;

  raise notice 'PART 6 (privilege surface): ALL ASSERTIONS PASSED';
end $$;


-- PART 7 — per-permission RLS (0020): staff JWTs cannot bypass the dashboard
do $$
declare
  v_ord_mgr uuid := gen_random_uuid();   -- manage_orders only
  v_cat_mgr uuid := gen_random_uuid();   -- manage_products, NOT manage_prices
  v_var uuid; v_prod uuid; v_order uuid; v_coupon uuid;
  v_price numeric; v_n int; v_status order_status; v_setting jsonb;
begin
  insert into auth.users (id, email) values (v_ord_mgr, 'om@t.ly'), (v_cat_mgr, 'cm@t.ly');
  insert into admin_users (id, full_name, role, permissions, active) values
    (v_ord_mgr, 'OM', 'manager', array['view_orders','manage_orders'], true),
    (v_cat_mgr, 'CM', 'manager', array['manage_products'], true);

  select id, product_id, price into v_var, v_prod, v_price from product_variants where active order by created_at limit 1;
  select id, order_status into v_order, v_status from orders order by created_at limit 1;
  select id into v_coupon from coupons limit 1;
  select value into v_setting from site_settings where key = 'whatsapp_number';

  -- ---- orders manager -------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_ord_mgr::text, true);
  set local role authenticated;
  update product_variants set price = 0.001 where id = v_var;
  update coupons set value = 100 where id = v_coupon;
  update site_settings set value = '"x"'::jsonb where key = 'whatsapp_number';
  update products set name = 'HACK' where id = v_prod;
  begin
    update orders set order_status = 'PENDING' where id = v_order;
    assert false, 'direct order_status update must be denied';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into order_items (order_id, product_id, variant_id, product_name_snapshot, variant_name_snapshot, unit_price_snapshot, quantity, line_total)
      values (v_order, v_prod, v_var, 'x', 'x', 1, 1, 1);
    assert false, 'direct order_items insert must be denied';
  exception when insufficient_privilege then null;
  end;
  update orders set internal_note = 'called customer' where id = v_order;
  get diagnostics v_n = row_count;
  assert v_n = 1, 'manage_orders may edit internal_note';
  select count(*) into v_n from orders;
  assert v_n >= 1, 'view_orders may read orders';
  reset role;

  assert (select price from product_variants where id = v_var) = v_price, 'orders manager changed a price!';
  assert v_coupon is null or (select value from coupons where id = v_coupon) <> 100, 'orders manager changed a coupon!';
  assert (select value from site_settings where key = 'whatsapp_number') = v_setting, 'orders manager changed settings!';
  assert (select name from products where id = v_prod) <> 'HACK', 'orders manager edited a product!';
  assert (select order_status from orders where id = v_order) = v_status, 'order status changed outside the RPC!';

  -- ---- catalogue manager (no manage_prices) --------------------------------
  perform set_config('request.jwt.claim.sub', v_cat_mgr::text, true);
  set local role authenticated;
  update products set short_description = coalesce(short_description, '') where id = v_prod;
  get diagnostics v_n = row_count;
  assert v_n = 1, 'manage_products may edit products';
  begin
    update product_variants set price = price + 1 where id = v_var;
    assert false, 'price change without manage_prices must be denied';
  exception when insufficient_privilege then
    assert sqlerrm like 'PRICE_PERMISSION_REQUIRED%', sqlerrm;
  end;
  begin
    update product_variants set stock_quantity = stock_quantity + 100 where id = v_var;
    assert false, 'direct stock edit must be denied';
  exception when insufficient_privilege then
    assert sqlerrm like 'STOCK_LEDGER_ONLY%', sqlerrm;
  end;
  select count(*) into v_n from orders;
  assert v_n = 0, 'catalogue manager must not read customer orders (PII)';
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  raise notice 'PART 7 (per-permission RLS): ALL ASSERTIONS PASSED';
end $$;


-- PART 8 — anti-hoarding limits (0018): quantity cap + open orders per phone
do $$
declare
  v_var uuid; v_zone uuid; i int;
begin
  insert into products (slug, name, active) values ('hoard', 'HOARD', true);
  insert into product_variants (product_id, size, unit, price, stock_quantity)
    select id, 50, 'ml', 10, 500 from products where slug = 'hoard' returning id into v_var;
  select id into v_zone from delivery_zones where active limit 1;

  begin
    perform create_order(jsonb_build_object('customer_name','h','phone','218933333333','address','addr',
      'delivery_zone_id', v_zone, 'items', jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 11))), null);
    assert false, 'qty above max_qty_per_line must be refused';
  exception when others then
    assert sqlerrm like 'INVALID_QUANTITY%', sqlerrm;
  end;

  for i in 1..3 loop
    perform create_order(jsonb_build_object('customer_name','h','phone','218933333333','address','addr',
      'delivery_zone_id', v_zone, 'items', jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1))), 'hoard-' || i);
  end loop;
  begin
    perform create_order(jsonb_build_object('customer_name','h','phone','218933333333','address','addr',
      'delivery_zone_id', v_zone, 'items', jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1))), 'hoard-4');
    assert false, '4th open order for one phone must be refused';
  exception when others then
    assert sqlerrm like 'TOO_MANY_OPEN_ORDERS%', sqlerrm;
  end;

  -- city always comes from the zone, never from the payload
  assert not exists (select 1 from orders where phone = '218933333333'
                      and city is distinct from (select coalesce(nullif(city,''), name) from delivery_zones where id = v_zone)),
    'order city must come from the delivery zone';
  raise notice 'PART 8 (anti-hoarding): ALL ASSERTIONS PASSED';
end $$;

-- ---------------------------------------------------------------------------
-- PART 9 — permanent product deletion (0023)
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid; v_mgr uuid; v_adm uuid; v_zone uuid;
  v_p uuid; v_pkeep uuid; v_va uuid; v_vb uuid; v_vk uuid; v_c uuid;
  v_ord jsonb; v_oid uuid; v_total numeric; v_res jsonb; v_detail text; v_t uuid;
begin
  select id into v_owner from admin_users where role = 'owner' limit 1;
  select id into v_zone from delivery_zones where active limit 1;
  insert into auth.users (id, email) values (gen_random_uuid(), 'delmgr@velmor.ly') returning id into v_mgr;
  insert into admin_users (id, full_name, role, permissions, active)
    values (v_mgr, 'DelMgr', 'manager', array['manage_products','manage_inventory'], true);
  insert into auth.users (id, email) values (gen_random_uuid(), 'deladm@velmor.ly') returning id into v_adm;
  insert into admin_users (id, full_name, role, active) values (v_adm, 'DelAdm', 'admin', true);

  -- the perfume to delete (with every kind of child row) + one that must survive
  insert into products (slug, name, name_ar, active) values ('del-me', 'DELETE ME', 'عطر الحذف', true) returning id into v_p;
  insert into products (slug, name, name_ar, active) values ('keep-me', 'KEEP ME', 'عطر يبقى', true) returning id into v_pkeep;
  insert into product_variants (product_id, size, unit, price, stock_quantity) values (v_p, 50, 'ml', 100, 10) returning id into v_va;
  insert into product_variants (product_id, size, unit, price, stock_quantity) values (v_p, 100, 'ml', 180, 10) returning id into v_vb;
  insert into product_variants (product_id, size, unit, price, stock_quantity) values (v_pkeep, 50, 'ml', 90, 10) returning id into v_vk;
  insert into product_images (product_id, url, is_primary, sort_order) values (v_p, 'https://x/del-1.jpg', true, 0), (v_p, 'https://x/del-2.jpg', false, 1);
  insert into reviews (product_id, rating, display_name, status) values (v_p, 5, 'ع', 'APPROVED');
  insert into wishlist_items (device_id, product_id) values ('dev-del', v_p);
  insert into coupons (code, type, value) values ('DELTEST', 'PERCENTAGE', 5) returning id into v_c;
  insert into coupon_products (coupon_id, product_id) values (v_c, v_p);
  perform adjust_inventory(v_va, 5, 'RESTOCK', null, null, 'seed ledger');
  update site_settings set value = '"del-me"' where key = 'home_signature_product';

  -- ---- privileges: callable by signed-in users (self-guarding), never by anon ----
  assert not has_function_privilege('anon', 'admin_delete_product(uuid,text)', 'execute'), 'anon must not execute admin_delete_product';
  assert has_function_privilege('authenticated', 'admin_delete_product(uuid,text)', 'execute'), 'authenticated may call the self-guarding RPC';

  -- ---- anon: refused at the privilege layer ----
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform admin_delete_product(v_p, 'عطر الحذف');
    assert false, 'anon must not delete products';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- ---- signed in but not an admin ----
  set local role authenticated;
  begin
    perform admin_delete_product(v_p, 'عطر الحذف');
    assert false, 'non-admin must not delete products';
  exception when others then
    assert sqlerrm = 'NOT_AUTHORIZED', 'non-admin: ' || sqlerrm;
  end;
  reset role;

  -- ---- manager WITH manage_products can archive but not destroy ----
  perform set_config('request.jwt.claim.sub', v_mgr::text, true);
  set local role authenticated;
  begin
    perform admin_delete_product(v_p, 'عطر الحذف');
    assert false, 'manager must not permanently delete';
  exception when others then
    assert sqlerrm = 'NOT_AUTHORIZED', 'manager: ' || sqlerrm;
  end;
  reset role;

  -- ---- admin: wrong / empty confirmation name is refused, nothing deleted ----
  perform set_config('request.jwt.claim.sub', v_adm::text, true);
  set local role authenticated;
  begin
    perform admin_delete_product(v_p, 'اسم آخر');
    assert false, 'wrong confirmation name must be refused';
  exception when others then
    assert sqlerrm = 'CONFIRMATION_MISMATCH', 'wrong name: ' || sqlerrm;
  end;
  begin
    perform admin_delete_product(v_p, '   ');
    assert false, 'blank confirmation must be refused';
  exception when others then
    assert sqlerrm = 'CONFIRMATION_MISMATCH', 'blank name: ' || sqlerrm;
  end;
  reset role;
  assert exists (select 1 from products where id = v_p), 'product must survive a refused delete';

  -- ---- an open order blocks the deletion (customer is still owed the perfume) ----
  v_ord := create_order(jsonb_build_object(
      'customer_name','حذف','phone','218955500001','address','عنوان','delivery_zone_id', v_zone,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_va, 'quantity', 2))), 'del-test-1');
  select id, total into v_oid, v_total from orders where public_order_number = v_ord->>'order_number';

  set local role authenticated;
  begin
    perform admin_delete_product(v_p, 'عطر الحذف');
    assert false, 'open order must block deletion';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert sqlerrm = 'HAS_OPEN_ORDERS', 'open order: ' || sqlerrm;
    assert v_detail = '1', 'open order count in detail, got ' || coalesce(v_detail, 'null');
  end;
  reset role;
  assert exists (select 1 from products where id = v_p)
     and (select count(*) from product_variants where product_id = v_p) = 2, 'nothing may be removed while blocked';

  -- ---- order delivered → deletion allowed ----
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform admin_update_order_status(v_oid, 'CONFIRMED');
  perform admin_update_order_status(v_oid, 'DELIVERED', 'test', true);
  perform set_config('request.jwt.claim.sub', v_adm::text, true);
  assert (select coalesce(sum(reserved_quantity), 0) from product_variants where product_id = v_p) = 0, 'no stock left reserved';

  set local role authenticated;
  v_res := admin_delete_product(v_p, '  عطر   الحذف ');           -- extra spaces tolerated
  reset role;

  assert v_res->>'slug' = 'del-me' and v_res->>'name' = 'عطر الحذف', 'returns slug + name';
  assert jsonb_array_length(v_res->'images') = 2, 'returns the image URLs for storage cleanup';
  assert (v_res->'counts'->>'reviews')::int = 1 and (v_res->'counts'->>'wishlist_items')::int = 1, 'returns child counts';

  -- removed
  assert not exists (select 1 from products where id = v_p), 'product removed';
  assert not exists (select 1 from product_variants where id in (v_va, v_vb)), 'sizes removed';
  assert not exists (select 1 from product_images where product_id = v_p), 'images removed';
  assert not exists (select 1 from reviews where product_id = v_p), 'reviews removed';
  assert not exists (select 1 from wishlist_items where product_id = v_p), 'wishlist entries removed';
  assert not exists (select 1 from coupon_products where product_id = v_p), 'coupon scope removed';
  assert not exists (select 1 from inventory_movements where variant_id in (v_va, v_vb)), 'ledger of its sizes removed';
  assert (select value from site_settings where key = 'home_signature_product') = '""'::jsonb, 'homepage pointer cleared';
  assert position('del-me' in list_products('{}'::jsonb, 'recommended', 100, 0)::text) = 0, 'storefront listing no longer returns it';

  -- kept: the order, untouched, with its snapshot
  assert exists (select 1 from orders where id = v_oid and total = v_total and order_status = 'DELIVERED'), 'order kept, total unchanged';
  assert exists (select 1 from order_items where order_id = v_oid and product_id is null and variant_id is null
                    and product_name_snapshot is not null and unit_price_snapshot = 100 and quantity = 2), 'order line kept with snapshot, links nulled';
  -- kept: other products and the coupon itself
  assert exists (select 1 from products where id = v_pkeep) and exists (select 1 from product_variants where id = v_vk), 'other products untouched';
  assert exists (select 1 from coupons where id = v_c), 'coupon itself kept';

  -- audit trail
  assert exists (select 1 from admin_audit_logs
                  where action = 'delete' and entity = 'products' and entity_id = v_p::text and admin_id = v_adm
                    and previous_value->>'slug' = 'del-me'
                    and jsonb_array_length(previous_value->'variants') = 2
                    and jsonb_array_length(previous_value->'images') = 2
                    and reason = 'permanent_delete'), 'audit entry with a full snapshot';

  -- deleting again → not found
  perform set_config('request.jwt.claim.sub', v_adm::text, true);
  set local role authenticated;
  begin
    perform admin_delete_product(v_p, 'عطر الحذف');
    assert false, 'second delete must report not found';
  exception when others then
    assert sqlerrm = 'PRODUCT_NOT_FOUND', 'second delete: ' || sqlerrm;
  end;
  reset role;

  -- ---- name matching: Latin name, any case; an empty name_ar can never be matched by '' ----
  insert into products (slug, name, name_ar, active) values ('tmp-latin', 'Tmp Perfume', null, true) returning id into v_t;
  insert into product_variants (product_id, size, unit, price, stock_quantity) values (v_t, 50, 'ml', 50, 1);
  set local role authenticated;
  v_res := admin_delete_product(v_t, ' tmp   PERFUME');
  reset role;
  assert not exists (select 1 from products where id = v_t), 'Latin name, any case, deletes';

  insert into products (slug, name, name_ar, active) values ('tmp-blank-ar', 'Blank AR', '', true) returning id into v_t;
  set local role authenticated;
  begin
    perform admin_delete_product(v_t, '');
    assert false, 'empty string must never match an empty name_ar';
  exception when others then
    assert sqlerrm = 'CONFIRMATION_MISMATCH', 'empty vs empty name_ar: ' || sqlerrm;
  end;
  reset role;
  assert exists (select 1 from products where id = v_t), 'product kept';

  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'PART 9 (permanent product deletion): ALL ASSERTIONS PASSED';
end $$;

select 'DB ASSERTIONS PASSED' as result;
