# Backend Architecture (Planned)

Status: **partially implemented.**

| Piece | State |
|---|---|
| `reservations` table + RLS on Supabase | ✅ done (project `wkfplrhiigsdfnmylgov`) |
| Mini Program writes bookings to the DB | ✅ done (`utils/supabase.js`) |
| Mini Program cancels bookings | ✅ done (Edge Function `cancel-reservation`: verifies `code` + `contact_phone` match, then sets `status='cancelled'` via service role; idempotent, returns 404 on mismatch) |
| Restaurant console reads/manages orders | ✅ done (Edge Function `admin-manage` + `restaurant-admin/index.html`; passcode SHA-256 stored in `admin_credentials`, verified server-side; actions: `list` / `update_status`). Hosted at **https://restaurant-admin-tau-indol.vercel.app** (Vercel, project `xyjsteven15s-projects/restaurant-admin`; redeploy after editing with `vercel deploy --prod --yes` inside `restaurant-admin/`) |
| New-booking push notification | ✅ live (trigger `reservations_notify_insert` → pg_net → Edge Function `new-reservation-notify` → WeCom group bot; webhook stored in `app_config.wecom_webhook_url`, end-to-end tested 2026-08-07) |
| Cancellation push notification | ✅ live (trigger `reservations_notify_cancel` AFTER UPDATE OF status, fires only on transition into `cancelled` — catches both customer self-cancel and console cancel; same `new-reservation-notify` function renders a 「预订取消通知」 message, tested 2026-08-07) |
| Room inventory / overbooking guard | ✅ live (`rooms` table: 3 small + 1 large; BEFORE INSERT trigger `reservations_enforce_capacity` rejects with `room_fully_booked` when active bookings (pending/confirmed/seated) for the same date+daypart+tier reach room count, with per-slot advisory lock against races; Edge Function `check-availability` (JWT) feeds live remaining counts to the room-selection page; tested 2026-08-07: 4th small-room booking rejected, cancellation releases capacity) |
| Console→customer status sync | ✅ live (Edge Function `lookup-reservations`: phone+code matched, returns status strings only; `mine` page re-checks active bookings on every open, so manager-side confirm/cancel/seat is reflected on the customer's 「我的预订」; local creation status aligned to `pending`. Tested 2026-08-07: pending→confirmed→cancelled visible, wrong phone yields empty map) |
| Tracking events pipeline | ⬜ later |

**Access model in place:** the Mini Program ships a *publishable* key that has **INSERT only** — all other privileges were revoked, so a leaked key cannot read customer names or phone numbers. Verified: `POST` → `201`, `GET` → `401 permission denied`. The console will therefore read through an Edge Function using the service role, never the publishable key.

The Mini Program still keeps a local copy of each booking for its own "My Bookings" screen, since it has no read access to the database.

## 1. High-level flow

```
┌─────────────────────────────┐
│   WeChat Mini Program        │
│   - customer booking flow    │
│   - tracking / 埋点 events    │
└───────────────┬─────────────┘
                │ HTTPS (JSON)
                ▼
┌─────────────────────────────┐
│   Backend API                │
│   REST or Supabase Edge Fn   │
│   - validate & write booking │
│   - ingest tracking events   │
└───────────────┬─────────────┘
                │ SQL
                ▼
┌─────────────────────────────┐
│   Supabase PostgreSQL         │
│   reservations / rooms /      │
│   tracking_events / staff     │
└───────────────┬─────────────┘
                │ Supabase Realtime (WebSocket)
                ▼
┌─────────────────────────────┐
│   Restaurant Console (web)   │
│   - live reservation board   │
│   - confirm / seat / cancel  │
└─────────────────────────────┘
```

Two viable implementations:

- **Option A — Supabase-only (fastest).** Client talks directly to Supabase via `@supabase/supabase-js` using the anon key; Row Level Security (RLS) enforces access. Business rules (deposit, availability) live in Postgres functions / Edge Functions. Restaurant console subscribes to Realtime.
- **Option B — Own API in front (more control).** A thin API (Node/Express, or Supabase Edge Functions) sits between the Mini Program and the database; it validates input, applies WeChat auth (`code2session`), and writes to Postgres. Recommended once payments/deposits are real.

> WeChat requires HTTPS and that every request domain be added to the Mini Program's `request` domain allow-list in the mp.weixin.qq.com console.

## 2. Database schema (Supabase / PostgreSQL)

```sql
-- Restaurants (supports multi-store later)
create table restaurants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  phone       text,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz default now()
);

-- Private rooms
create table rooms (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  name          text not null,          -- 桥遇厅 / 徽来堂 ...
  tier          text not null check (tier in ('small','large')),
  min_guests    int not null,
  max_guests    int not null,
  has_ktv       boolean default false
);

-- Reservations (mirrors the mini program booking record)
create table reservations (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,        -- e.g. QST20250725001
  restaurant_id  uuid references restaurants(id),
  room_id        uuid references rooms(id),
  reserve_date   date not null,
  reserve_time   text not null,               -- '18:00'
  daypart        text not null check (daypart in ('lunch','dinner')),
  guests         int  not null,
  room_tier      text not null,               -- small | large
  room_name      text,
  has_ktv        boolean default false,
  contact_name   text not null,
  contact_phone  text not null,
  note           text,
  status         text not null default 'pending'
                 check (status in ('pending','confirmed','seated','cancelled','no_show')),
  source         text default 'miniprogram',
  openid         text,                         -- WeChat user (from code2session)
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index on reservations (reserve_date, status);
create index on reservations (restaurant_id, reserve_date);

-- Analytics / 埋点
create table tracking_events (
  id          bigint generated always as identity primary key,
  event_name  text not null,     -- view_home, tap_reserve, view_rooms, submit_reservation ...
  page        text,
  props       jsonb,
  openid      text,
  session_id  text,
  created_at  timestamptz default now()
);

-- Console access: single manager only (no multi-staff / roles for now).
-- Simplest = one Supabase auth user (the 店长). No `staff` table needed.
-- If multi-staff is ever required later, add a staff table then.
```

## 3. API endpoints (Option B) / RPC

| Method | Path                         | Who        | Purpose                                  |
|--------|------------------------------|------------|------------------------------------------|
| POST   | `/reservations`              | customer   | Create a booking (validates availability)|
| GET    | `/reservations?date=&status=`| restaurant | List bookings for the console            |
| PATCH  | `/reservations/:id/status`   | restaurant | confirm / seat / cancel / no_show        |
| GET    | `/rooms/availability?date=&daypart=&guests=` | customer | Remaining rooms per tier      |
| POST   | `/track`                     | customer   | Batch-ingest tracking events             |

## 4. Realtime for the restaurant console

With Supabase Realtime, the console gets new bookings instantly:

```js
supabase
  .channel('reservations')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'reservations' },
      (payload) => addReservationToBoard(payload.new))
  .subscribe();
```

## 5. Security (RLS) notes

- Enable RLS on all tables.
- **Customers**: may `insert` reservations and `select` only their own rows (`openid = auth.jwt()->>'openid'`), if using Supabase auth with a WeChat provider; otherwise route customer writes through the backend service role.
- **Console access = single passcode / private link** (chosen approach — simplest, no accounts). The 店长 opens a private URL and enters one shared passcode.
  - ⚠️ A passcode checked **in browser JS is not real security** (anyone can read the source). It only hides the UI.
- ✅ To make it actually secure without accounts: put the passcode check in a **Supabase Edge Function** that holds the DB access server-side. The browser sends `{ passcode }`; the function verifies it against a secret and returns the reservations. The DB keys never reach the browser. (Implemented as `admin-manage`.)
- Passcode is a shared secret → rotate it if leaked; keep the private link unlisted.
- **Hosting note**: Supabase's gateway rewrites all `text/html` responses (Edge Functions *and* Storage public URLs) to `text/plain` with a sandboxed CSP — so the console page cannot be hosted on `*.supabase.co`. It is therefore hosted on Vercel (static file, no secrets in it; all data still goes through the passcode-gated `admin-manage` function).
- Never ship the Supabase **service_role** key inside the Mini Program or the console — only the anon key (or go through the Edge Function / backend API).

## 6. Mini Program changes when the backend lands

- `pages/reserve-confirm/reserve-confirm.js` `submit()` → `POST /reservations` instead of `app.globalData.reservations.unshift(...)`. ✅ done
- `pages/room-selection/room-selection.js` availability → Edge Function `check-availability` (live counts per tier; DB trigger is the hard guard). ✅ done
- `pages/mine/mine.js` list → `GET /reservations` for the current user. (intentionally local-only: anon key has no read access; cancellation goes through `cancel-reservation`)
- `utils/track.js` `flush()` → `POST /track` (currently buffers in storage).
- Add request domains in the mp console; keep keys in a config not committed to git.
