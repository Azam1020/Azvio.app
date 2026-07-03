# AZVIO — PRD & Progress

## Product
Native mobile app (Expo) for AZVIO — single-admin freelancer business (drone videography + video editing). Arabic RTL UI, AZVIO light theme (**#3E9194 teal** — official brand color, Cairo font). Backend: FastAPI + MongoDB.

## User decisions (confirmed)
- App type: native mobile app (Expo). PWA export deferred to end.
- AI: Claude Sonnet 4.5 (Sanad chat) + Gemini 3 Pro (PDF/Excel/image analysis) + Gemini 3.5 Flash (fast suggestions) via Emergent Universal Key
- Auth: JWT email/password (2 pre-seeded admins, initial password `Azvio@2026`) + Emergent Google Sign-in — both restricted to whitelist {info@azvio.co, azzam@azvio.co}
- Google Calendar: internal calendar first; Google OAuth sync deferred until user provides credentials (Phase 2)
- Logo: **REAL AZVIO logo installed** (assets/images/azvio-logo.png) — used in login, dashboard, splash, icons.
- Sub-categories: Sanad-suggested + manual (with hidden Sanad-only description)
- File storage strategy: base64 in MongoDB (Supabase Storage deferred)

## Phase 1 (MVP) — DONE
- [x] Restricted auth: email/password JWT + Google sign-in (Emergent), whitelist enforced backend-side, change-password endpoint
- [x] Clients module: CRUD, search, status, WhatsApp deep link, Drive link, source, manual logs
- [x] Financial module: transactions, summary, debts, subscriptions, AI PDF invoice extraction
- [x] Content pipeline: idea → filming → editing → published
- [x] Internal calendar, My Services, Quick Links, Sanad AI chat + file analysis, Dashboard

## Phase 2 (Update — DONE in this session)
- [x] **Real AZVIO logo** on login/dashboard/splash/icons (replaced text wordmark)
- [x] **Brand color** changed globally from #D95D39 (orange) → #3E9194 (teal)
- [x] **Sub-categories** on client: new `Categories` collection (7 seeded). CategoryPicker component (chips + manage modal: manual add + Sanad-suggested)
- [x] **File attachments** in client activity log (PDF/images/any) — base64 in Mongo, view via data URI (web) or WebBrowser (native)
- [x] **Auto price opinion** by Sanad — inline debounced comparison with market range (fair/low/high verdict) shown under price input without user asking
- [x] **"Sanad helps me"** buttons (✨) on Content (idea suggestions) and Services (service+price suggestions) screens
- [x] **Dashboard live charts**: BarChart (income/expenses 6mo) + PieChart (content stages) via react-native-gifted-charts
- [x] **Personalize dashboard**: settings icon opens toggle sheet for 5 widgets, prefs saved in AsyncStorage
- [x] **Sanad extended actions**: add_category + add_service via chat commands
- [x] **Quick links simplified** to 2 fixed: منصة رائد + azvio.co
- [x] **Backend timeseries endpoint** GET /api/dashboard/timeseries?months=N

## Phase 3 (Deferred — awaiting user inputs)
- [ ] Google Calendar OAuth sync (needs Google Cloud Client ID/Secret from user)
- [ ] Link 2 Google accounts (azzam@azvio.co + azam150azm@gmail.com) inside app
- [ ] Supabase Storage migration (currently base64 in Mongo)
- [ ] PWA export configuration (deferred to end per user)
- [ ] Auto portfolio sync to azvio.co on delivery
- [ ] AI WhatsApp chat analysis
- [ ] WhatsApp Business API
- [ ] Multi-user support
- [ ] Full Google Drive API integration

## Backend architecture
- /app/backend/server.py — app, CORS, startup (seed admins + defaults, indexes)
- /app/backend/database.py — motor client
- /app/backend/auth.py — JWT + Emergent Google session auth, whitelist
- /app/backend/crud_routes.py — clients/transactions/finance/content/services/links/events/dashboard/categories + timeseries
- /app/backend/sanad.py — chat + file analysis + invoice extraction + price-opinion + suggest-content/categories/services
- Collections: users, user_sessions, clients (with sub_category, logs w/ attachments), transactions, content, services, quick_links, events, chat_messages, **categories** (new)

## Frontend architecture (Expo Router, RTL)
- src/theme.ts (teal #3E9194 + brandSoft/brandDark), src/api.ts, src/AuthContext.tsx
- src/ui.tsx (base widgets)
- **src/CategoryPicker.tsx** (new) — inline chips + manage modal
- **src/SanadPriceOpinion.tsx** (new) — debounced inline market comparison
- **src/SanadSuggestModal.tsx** (new) — reusable "help me" modal
- src/clientHelpers.ts — services + Sanad helpers
- app/login.tsx (logo image), app/(tabs)/index.tsx (dashboard w/ charts + personalize)
- app/(tabs)/clients.tsx, app/client/[id].tsx (with file upload log)
- app/content.tsx, app/services.tsx (both with Sanad button)
- app/links.tsx (2 fixed links)

## Notes
- User language: Arabic — all UI + agent replies in Arabic
- 35/35 backend tests passing (see /app/test_reports/iteration_2.json)
- react-native-gifted-charts requires react-native-svg peer (installed)
