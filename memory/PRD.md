# AZVIO — PRD & Progress

## Product
Native mobile app (Expo) for AZVIO — single-admin freelancer business (drone videography + video editing). Arabic RTL UI, AZVIO light theme (#D95D39 rust accent, Cairo font). Backend: FastAPI + MongoDB.

## User decisions (confirmed)
- App type: native mobile app (Expo)
- AI: Claude Sonnet 4.5 (Sanad chat) + Gemini 3 Pro (PDF/Excel/image analysis) via Emergent Universal Key
- Auth: JWT email/password (2 pre-seeded admins, initial password `Azvio@2026`) + Emergent Google Sign-in — both restricted to whitelist {info@azvio.co, azzam@azvio.co}
- Google Calendar: internal calendar first; Google OAuth sync deferred until user provides credentials (Phase 2)
- Logo: text-based AZVIO logo (user may upload real logo later)

## Phase 1 (MVP) — DONE (built in this session)
- [x] Restricted auth: email/password JWT + Google sign-in (Emergent), whitelist enforced backend-side, change-password endpoint
- [x] Clients module: CRUD, search, status (in_progress/delivered), WhatsApp deep link, Drive link, source, manual logs (note/whatsapp/form)
- [x] Financial module: transactions (income/expense/withdrawal/debt/subscription), summary, debts paid toggle, subscriptions view, AI PDF invoice extraction (Gemini) with confirm-before-save
- [x] Content pipeline: idea → filming → editing → published, advance stage, delete
- [x] Internal calendar: events (shooting/delivery/other), grouped by date, dashboard upcoming
- [x] My Services: CRUD with price ranges (seeded 2 defaults)
- [x] Quick Links: CRUD (seeded: azvio.co, Netlify, Supabase, Drive)
- [x] Sanad AI: Claude chat w/ business context + history, <action> tags executed server-side (add_client/add_transaction/add_content/add_event/update_client_status), file chat (PDF/image/CSV/Excel via Gemini), clear history
- [x] Dashboard: month income/expenses, project counts, section nav, upcoming events

## Backend architecture
- /app/backend/server.py — app, CORS, startup (seed admins + defaults, indexes)
- /app/backend/database.py — motor client
- /app/backend/auth.py — JWT + Emergent Google session auth, whitelist, get_current_user (accepts both token types as Bearer)
- /app/backend/crud_routes.py — clients/transactions/finance/content/services/links/events/dashboard
- /app/backend/sanad.py — Sanad chat (claude-sonnet-4-5-20250929), file analysis + invoice extraction (gemini-3.1-pro-preview), action executor
- Collections: users, user_sessions, clients, transactions, content, services, quick_links, events, chat_messages (all uuid `id`, ISO dates)

## Frontend architecture (Expo Router, RTL via row-reverse/right-align)
- src/theme.ts (design tokens), src/api.ts (fetch + token via storage util), src/AuthContext.tsx (dual login), src/ui.tsx (ScreenHeader/Field/Chips/AppModal/Empty/confirmAsync)
- app/login.tsx, app/index.tsx (gate), app/auth.tsx (deep-link landing)
- app/(tabs)/: index (dashboard), clients, finance, sanad
- app/client/[id].tsx, app/content.tsx, app/calendar.tsx, app/services.tsx, app/links.tsx
- Fonts: Cairo (assets/fonts), Ionicons

## Phase 2 (upcoming)
- [ ] Google Calendar OAuth sync (needs user's Google Cloud Client ID/Secret)
- [ ] Auto portfolio sync to azvio.co on delivery
- [ ] AI WhatsApp chat analysis
- [ ] Replace text logo with real AZVIO logo file (user upload)
- [ ] Change-password UI screen (endpoint exists)

## Phase 3 (backlog)
- [ ] WhatsApp Business API
- [ ] Multi-user support
- [ ] Full Google Drive API integration

## Notes
- User language: Arabic — all UI + agent replies in Arabic
- Sanad uses non-streaming send_message (action parsing on complete response; RN fetch lacks SSE)
- One transient LLM error seen once ("Budget exceeded 0.0") — retried OK
