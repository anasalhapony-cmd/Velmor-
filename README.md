# VELMOR — Arabic-first luxury fragrance e-commerce

A production-oriented, Arabic-first (RTL) fragrance storefront **and admin dashboard** for a Libyan
market launch: online-only, home delivery, Cash on Delivery. Built on Next.js (App Router) +
Supabase (PostgreSQL) with server-authoritative pricing, atomic COD order creation, real inventory
with an audit ledger, RLS on every table, and a full admin CMS.

> All money is computed on the server. The client is never trusted for price, stock, discount,
> delivery fee, totals, order status, or permissions.

---

## Tech stack

- **Next.js 15** (App Router, Server Components, Server Actions), **TypeScript** (strict)
- **Supabase**: PostgreSQL, Auth, Storage, RLS
- Storefront: the approved VELMOR design as scoped CSS (`app/(store)/store.css`, `.vp-*`) + a tiny
  dependency-free motion engine (`components/store/motion/engine.ts`; honours `prefers-reduced-motion`)
- Admin: **Tailwind CSS**, **Lucide**; shared: **Zustand**, **React Hook Form + Zod**

## Requirements

- Node.js **≥ 20.9**
- A **Supabase** project (free tier is fine to start)
- (Deploy) A **Vercel** account

---

## 1. Install

```bash
npm install
cp .env.example .env.local     # then fill in the values (see below)
```

### Environment variables (`.env.local`)

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | anon public key |
| `NEXT_PUBLIC_SITE_URL` | metadata / SEO | e.g. `https://velmor.ly` |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | bypasses RLS — never expose to the browser |
| `DATABASE_URL` | migration/seed scripts only | Project Settings → Database → Connection string (URI) |
| `CRON_SECRET` | `/api/cron/expire-orders` | ≥16 chars; Vercel Cron sends it as a Bearer token. Unset = job disabled |
| `RATE_LIMIT_STORE` | rate limiter | unset = durable Postgres buckets (prod); `memory` for local dev only |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | `db:create-admin` only | first owner bootstrap |

---

## 2. Database: migrate + seed

The schema lives in `supabase/migrations/` (ordered, reproducible). Apply it to your Supabase DB:

```bash
npm run db:migrate      # applies 0001 … 0023 (tracked in schema_migrations; safe to re-run)
npm run db:seed         # DEV sample catalogue — REQUIRED to see the homepage as designed (5 perfumes, families, copy)
```

> **Migration `0013` (grants hardening) is mandatory on Supabase** — it revokes broad table access
> from `anon`/`authenticated` and hides exact stock counts from the public.

| Migration | Purpose |
|---|---|
| `0015` | admin RPCs (audit logging, guarded inventory adjust, dashboard aggregates) |
| `0016` | notifications outbox (queued rows only — no fake integrations) |
| `0017` | adds the `admin` role (must run in its own transaction) |
| `0018` | Phase 2 commerce: stock reservations, status state machine + history, auto-expiry, gift-wrap architecture (off), `create_order` v3 (anti-hoarding caps, zone-derived city, advisory-locked idempotency), `quote_order_v2`, durable rate limits, catalogue browse v2, design homepage sections |
| `0019` | **privilege lockdown** — revokes Supabase's default EXECUTE/ALL grants and re-grants an explicit allowlist (mandatory) |
| `0023` | `admin_delete_product` — **permanent perfume deletion** (owner/admin only, typed-name confirmation, refuses while orders are open, audit snapshot) |
| `0022` | creates the public `product-images` storage bucket (5 MB, images only) |
| `0021` | storefront copy setting (`delivery_tagline`, approved wording) |
| `0020` | **RLS per permission** — staff JWTs can only write the tables their permission owns; ledgers are RPC-only; prices need `manage_prices`; stock changes only via the ledger |

> `0019` and `0020` are security migrations. Without them, Supabase's default privileges would let the
> anon key call internal functions, and any staff account could edit prices/coupons via the REST API.

> The scripts read `.env.local` automatically.
>
> **Homepage looks empty or different?** Without the seed (or real products), the
> collection rail, families, signature, discovery grid and reviews have nothing to show and are
> hidden — the page then looks nothing like the approved design. Run `npm run db:seed`, or add
> products (with images and a fragrance family) from `/admin`.

## 3. Create the first admin (owner)

Admins are Supabase Auth users linked to an `admin_users` row. Bootstrap the owner:

```bash
ADMIN_EMAIL=owner@velmor.ly ADMIN_PASSWORD='a-strong-password' ADMIN_NAME='Owner' \
  npm run db:create-admin
```

Then sign in at **`/admin/login`**.

## 4. Storage bucket for product images

The admin image uploader (`/api/admin/upload`) stores files in a Supabase Storage bucket named
**`product-images`**. Create it once:

- Created automatically by migration `0022` (and, as a fallback, by the uploader on first use).
  Manual alternative: Supabase → Storage → **New bucket** → name `product-images`, **Public** = on.
- Public read is enough for the storefront; uploads happen server-side with the service role, so no
  extra write policy is required. (You can also add product images by external URL from the editor.)

## 4a. Performance on phones

- **Test a production build, not `npm run dev`.** The dev server ships the unminified
  React development build, recompiles on demand and keeps an HMR socket open — on a
  phone it is several times slower than the real site. Judge speed with
  `npm run build && npm run start` (or a Vercel deployment).
- **Product photos are resized automatically.** Every product/editorial image goes
  through `components/store/photo.tsx` → Next's image optimiser (WebP, sized to the
  width the layout needs), so a 5 MB phone photo reaches a phone as a small file. The
  first request of each size is encoded on demand and then cached. If a photo does not
  show locally, run `npm i sharp` and restart. Still upload reasonably sized photos
  (about 1200–1600 px on the long side) — it keeps the first load fast.
- The motion engine sleeps when nothing is moving and batches layout reads before
  style writes; `prefers-reduced-motion` still disables motion completely.

## 4b. Scheduled job — expire stale COD orders

Unconfirmed COD orders reserve stock. `order_expiry_hours` (Admin → Settings, default **48**) sets when
they auto-expire; the job is `/api/cron/expire-orders`, scheduled in `vercel.json` (daily, which the
Vercel Hobby plan allows — on Pro you may run it hourly, e.g. `0 * * * *`). Set `CRON_SECRET` in Vercel.
Anti-hoarding caps are also settings: `max_qty_per_line` (10), `max_cart_lines` (20),
`max_open_orders_per_phone` (3).

---

## 5. Verify

```bash
npm run verify     # tsc --noEmit  +  unit tests  +  next build
```

Individual checks:

```bash
npm run typecheck          # strict TypeScript over the whole app (real types)
npm run test               # unit tests (money, phone, finder, order-status, permissions, rate limit, validation limits)
npm run test:db            # Postgres integration tests (needs local Postgres; see below)
npm run build              # production build
npm run typecheck:offline  # optional: type-check the admin against stubs WITHOUT node_modules
```

### Database integration tests (require a local Postgres)

`tests/db/assertions.sql` verifies business logic, RLS, per-permission policies, the privilege surface
(an exhaustive allowlist check) and anti-hoarding limits on a real Postgres; `scripts/run-db-tests.sh`
adds four concurrency races: 20 buyers for the last unit (no oversell), 20 buyers for a single-use
coupon (limit holds), 10 simultaneous submits with one idempotency key (exactly one order), and a
permanent delete colliding with buyers of the same perfume (never both: either the perfume is gone and
no order slipped in, or the delete is refused and stock is intact). They run
against a local Postgres using `scripts/_local_supabase_shim.sql`, which recreates the objects Supabase
provides **including its default privileges**, so the privilege tests see the real attack surface.

---

## 6. Deploy (Vercel + Supabase)

1. Push the repo to GitHub and **import it into Vercel**.
2. Add all environment variables from `.env.local` to the Vercel project (Production + Preview).
   Set `NEXT_PUBLIC_SITE_URL` to your real domain.
3. Ensure the database is migrated (`npm run db:migrate` against the production `DATABASE_URL`) and the
   `product-images` bucket exists.
4. Deploy. Add your domain in Vercel → Domains.

### Production checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set **only** as a server env var (never `NEXT_PUBLIC_`).
- [ ] All migrations applied (esp. `0013`, `0019`, `0020`); RLS enabled on every table.
- [ ] `CRON_SECRET` set; the expire-orders cron shows successful runs in Vercel.
- [ ] `product-images` bucket created.
- [ ] Owner account created; extra staff added with least-privilege roles.
- [ ] Dev seed **removed/replaced** with real products, prices, delivery zones, and page copy.
- [ ] `announcement`, WhatsApp number, and policies reviewed in **Admin → Settings / CMS**.
- [ ] `npm run verify` passes on CI.
- [ ] CSP verified in production (see note below).

---

## Admin dashboard (`/admin`)

Role-based (owner / admin / manager / staff) with granular permissions, enforced **in the database**
(RLS per permission, `0020`) as well as in the app. Sections:

- **Overview & Analytics** — KPIs, realised vs ordered revenue (COD), best sellers, orders by city, funnel.
- **Orders** — search/filter, detail, guarded status state-machine, internal notes, WhatsApp action.
- **Customers** — derived from orders (by phone).
- **Products** — multi-section editor: info, fragrance profile, variants, notes (pyramid), images (upload
  or URL), categories/collections, SEO, visibility. Archive (soft-delete) preserves order history.
- **Inventory** — stock adjustments through a single ledgered choke point; full movement history.
  **Permanent delete** ("حذف نهائي", owner / admin only): removes a perfume from the whole site — its sizes,
  photos, notes, reviews, wishlist entries, stock ledger and homepage pointer — after the owner types its
  name. Refused while any order for it is still open (new → out for delivery) or stock is reserved. Past
  orders are kept untouched (they snapshot the name, size, price and photo). Photo files are then removed
  from Storage unless an old order or another page still shows them. A full snapshot is written to the
  audit log. Use **Archive** instead when the perfume might come back.
- **Taxonomy** — brands, categories (hierarchical), collections, fragrance families, notes.
- **Coupons** (scope by product/category/brand) & **Promotions**.
- **Reviews** moderation (pending/approved/rejected; ratings roll up from approved only).
- **Delivery zones**, **CMS** (homepage sections, pages with §112 approval gate, FAQ, content blocks),
  **Settings** (grouped, incl. Perfume Finder weights, feature toggles, maintenance mode).
- **Audit log** (append-only) and **Admin accounts** (owner-only).

Every admin mutation is authorized server-side (RLS + `is_admin()`/`has_permission()`), and important
changes are written to the audit log via the `log_admin_action` RPC.

---

## Security model (summary)

- **RLS on every table.** Public can read only safe, active catalog rows; exact stock is never exposed
  (a `stock_status` bucket is shown instead). All customer writes go through `SECURITY DEFINER` RPCs.
- **Server-authoritative money.** `create_order` locks each variant, revalidates price + stock,
  decrements inventory atomically, snapshots line items, and is idempotent by key.
- **Order privacy.** Tracking requires order number **and** phone; public order numbers are random.
- **Uploads** are validated by magic-bytes (not extension/MIME), size-limited (5 MB), require an
  existing product (UUID-validated) and get random object names.
- **Least privilege in the DB.** `0019` removes Supabase's default grants; `0020` scopes every admin
  write to its permission. Quote/track RPCs are reachable only through rate-limited server routes.
- **Rate limits** are durable (Postgres), keyed by hashed IP from edge-set headers (`x-vercel-forwarded-for`
  / `x-real-ip`; only the last `x-forwarded-for` hop is trusted).
- **HSTS** + nonce CSP (`img-src` limited to self + Supabase).
- **CSP with per-request nonce** is applied in `middleware.ts`.

### CSP note (verify in production)

A nonce-based `Content-Security-Policy` is set per request. It intentionally omits `'strict-dynamic'`
so statically-rendered pages keep working, allows inline styles and images from self + `*.supabase.co`
(if admins add product images by external URL, add that host to `img-src`), and permits `unsafe-eval` in **development only** (React Fast Refresh).
Validate it against your final asset origins after the first production build; if you add third-party
scripts (analytics, etc.), extend `script-src`/`connect-src` in `buildCsp()`.

---

## Project structure

```
app/(store)/        storefront (home, products, product, cart, checkout, track, wishlist, finder, cms pages)
app/admin/          admin: login + (dashboard)/… (all management screens)
app/api/            checkout, quote, coupons, reviews, wishlist, search, track, analytics, finder, admin/upload, cron/expire-orders
components/store/   storefront (approved design): chrome, home, catalog, product, commerce, checkout, finder, motion
components/admin/   admin UI
lib/                supabase clients, orders, pricing, inventory, coupons, delivery, finder, admin, security, seo, utils, validation
supabase/migrations 0001–0020 (schema, RLS, functions, grants, admin RPCs, phase-2 commerce, lockdown)
supabase/seed       dev seed data (clearly marked)
tests/              unit tests, db assertions, offline typecheck stubs
```

## Notes on this build

- The database is the source of truth; `types/database.ts` is a hand-authored mirror of the schema.
- `tests/typecheck/app-stubs.d.ts` + `tsconfig.stubs.json` allow type-checking the admin **offline**
  (no `node_modules`) by stubbing external packages. The **authoritative** check is `npm run verify`
  with real types after `npm install`.

- Brand assets: the logo PNGs in `public/brand/` were re-extracted from the brand PDF (the originals in
  the upload were broken bottle silhouettes). Product photos in `public/images/products/` are the
  design renders — replace with real photography before launch.
- The storefront uses plain `<img>` (with explicit width/height, lazy loading below the fold) to match
  the approved art direction exactly; switching to `next/image` is a straightforward follow-up.
