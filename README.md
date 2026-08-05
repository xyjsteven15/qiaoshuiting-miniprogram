# 桥水汀 (Qiáo Shuǐ Tīng) · Fine-Dining Reservation Mini Program

A WeChat Mini Program for a high-end **New Anhui (Hui) cuisine** business-banquet restaurant. The visual language is New-Chinese / Hui-style — warm rice paper background `#F5F0E8`, Huizhou vermilion-lacquer accent `#8B2500`, serif headings, horse-head-wall (马头墙) motifs, and real interior photography — to convey a private, premium "hidden in the city" atmosphere.

## Features

- **Home** — brand identity (logo + private-room interior), Hui-style ornaments, brand story, one-tap reservation
- **Reservation** — date strip · lunch/dinner time slots · party size stepper
- **Select Room** — small / large private-room tiers with live availability, "recommended" and "bookable" states
- **Confirm** — booking summary + contact details
- **Success** — booking code and full details
- **My Bookings** — booking history, customer-service phone, restaurant map location
- **Custom TabBar** — inline-SVG themed icons (horse-head wall / calendar / guest)

## Tech

- Native WeChat Mini Program (WXML / WXSS / JS)
- Global theme variables and shared components (`app.wxss`)
- Local mock data layer (`utils/data.js`) — no backend dependency yet
- Lightweight analytics/tracking hook (`utils/track.js`) — buffers events locally, ready to POST to the backend
- Custom TabBar component (`custom-tab-bar/`)

## Project Structure

```
├── app.js / app.json / app.wxss   # global logic, config, theme
├── custom-tab-bar/                # custom bottom navigation
├── pages/                         # home / reserve / room-selection / confirm / success / my-bookings
├── utils/
│   ├── data.js                    # mock data
│   └── track.js                   # analytics/tracking hook
├── assets/                        # brand + interior images
├── preview/index.html             # in-browser page preview (mini program screens)
├── restaurant-admin/index.html    # restaurant-side reservation console (prototype)
└── docs/                          # PRD, wireframes, admin data model, backend architecture
```

## Roadmap: Backend

Reservations are currently kept on-device (mock). The planned architecture connects the client, an API layer, and a Supabase Postgres database, so the restaurant can see reservations in real time on a separate console:

```
Mini Program (client + tracking)
        │
        ▼
   Backend API  (REST / Supabase Edge Functions)
        │
        ▼
 Supabase PostgreSQL  ──(Realtime)──►  Restaurant Console
```

See [`docs/backend-architecture.md`](docs/backend-architecture.md) for the data model, SQL schema, API endpoints, tracking events, and security (RLS) notes.

## Getting Started

1. Open this folder in **WeChat DevTools**.
2. Replace the AppID with your own Mini Program AppID (currently a test/tourist value).
3. Compile & preview — or open `preview/index.html` for a static page preview, and `restaurant-admin/index.html` for the restaurant console prototype.

> This repository is a product prototype. All data is mocked locally; no real backend is wired yet.
