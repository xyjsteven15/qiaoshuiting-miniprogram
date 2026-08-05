# Backend Architecture (Planned)

Status: **design / not yet implemented.** The Mini Program currently stores reservations on-device (`wx.setStorageSync` + in-memory `globalData`). This document describes the target backend so the **restaurant can see reservations in real time** on a separate console.

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

-- Restaurant staff (who can read/manage the console)
create table staff (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid references restaurants(id),
  auth_user_id   uuid,          -- Supabase auth.users id
  display_name   text,
  role           text default 'staff' check (role in ('staff','manager','admin'))
);
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
- **Restaurant staff**: `select` / `update` reservations where `restaurant_id` matches their `staff.restaurant_id`.
- Never ship the Supabase **service_role** key inside the Mini Program — only the anon key (or go through the backend API).

## 6. Mini Program changes when the backend lands

- `pages/reserve-confirm/reserve-confirm.js` `submit()` → `POST /reservations` instead of `app.globalData.reservations.unshift(...)`.
- `pages/room-selection/room-selection.js` availability → `GET /rooms/availability`.
- `pages/mine/mine.js` list → `GET /reservations` for the current user.
- `utils/track.js` `flush()` → `POST /track` (currently buffers in storage).
- Add request domains in the mp console; keep keys in a config not committed to git.
