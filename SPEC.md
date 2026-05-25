# NutriSnap — Product Specification

## Overview

NutriSnap is a mobile-first progressive web app (PWA) for tracking daily nutrition. Users photograph meals or type descriptions to get instant AI-estimated macros. All logs, goals, and the per-user food library are stored in Supabase so data syncs across devices. The app tracks progress against user-defined goals and offers AI-generated nudges throughout the day.

Live: https://nutrisnap-lovat.vercel.app
Version: 1.2.0

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18, Create React App |
| Charting | Chart.js 4 |
| Service worker | Workbox 7 (CRA precaching + custom caching) |
| Auth + database | Supabase (email/password auth, Postgres with RLS) |
| Serverless proxy | Vercel (`api/claude.js`) |
| Hosting | Vercel |

All AI calls go through the serverless proxy. The proxy validates the user's Supabase JWT, strips internal fields, and routes to the selected AI provider.

---

## Authentication

- Email/password auth via Supabase (`@supabase/supabase-js`)
- `App.jsx` subscribes to `supabase.auth.onAuthStateChange` and renders the `LockScreen` when no session exists
- Sign-up succeeds without email confirmation (confirmation is disabled in the Supabase project). If `data.session` is present after `signUp`, the user is logged in instantly; otherwise the LockScreen shows a "check your email" message as a fallback
- Every request to `/api/claude` includes `_supabaseToken`. The proxy verifies it by calling `${SUPABASE_URL}/auth/v1/user` and returns 401 if invalid
- A 401 from the proxy triggers `supabase.auth.signOut()` and dispatches a `nutrisnap_unauthorized` event so the UI returns to the LockScreen

---

## AI Providers

The user selects a provider in Settings and enters their own API key. The key is stored in `localStorage` (per-device) and sent to the proxy on every request. If the user has no key set, the proxy falls back to `ANTHROPIC_API_KEY` on the server.

| Provider | Model | Notes |
|---|---|---|
| Google Gemini | `gemini-3.5-flash` | Default. Falls back to `gemini-2.5-flash` on 503 |
| Anthropic | `claude-haiku-4-5-20251001` | Vision supported. Uses `{` assistant prefill for JSON responses |
| OpenAI | `gpt-4o-mini` | Vision supported. Uses `response_format: { type: 'json_object' }` when JSON is requested |

**Fallback behaviour:** When Gemini 3.5 Flash returns 503 (overloaded), the proxy silently retries with Gemini 2.5 Flash. The model actually used is returned as `_modelUsed` and shown on the review screen and log entries.

**Retry behaviour:** The client retries any 429, 503, or 529 response up to twice, with 1 s and 2 s delays.

---

## Food Analysis

A meal (image or text) is analysed in a single AI call that returns a per-component breakdown plus meal totals. This gives the model the freedom to enumerate every visible item (rice, protein, vegetables, sauces, oils, dressings, garnishes) rather than collapsing the plate to a single dominant food — the latter was the failure mode that made multi-component meals badly under-count protein/fat/calories.

**Request — `analyzeFood(image)` / `analyzeFoodText(description)`**
- The prompt instructs the model to enumerate every component, estimate each portion in grams, be generous with sauces/oils/cooking fats, and sum macronutrients across components
- `max_tokens: 4096`, `_jsonResponse: true` (4096 covers Gemini 2.5's thinking-token usage on top of the JSON content — 2048 silently truncated complex meals)

**Response schema**

```json
{
  "name": "concise meal description",
  "components": [{"name": "...", "amount": 200, "unit": "g"}, ...],
  "amount": 380, "unit": "g",
  "calories": 720, "protein": 38, "carbs": 65, "fat": 28, "fiber": 6
}
```

**Mapping to the review screen and DB**
- Per-unit macros = totals scaled to 100 g (`refMacros = totals × 100 / amount`), so the editable card always shows "Per 100 g"
- `refAmount = 100`, `refUnit = "g"`, `amount = totals.amount`. Editing the amount on the review screen rescales totals live without re-calling the AI
- The components list is shown read-only above the amount card so the user can see what the model identified, but is not persisted to the log

If the user edits the per-100g macros on the review screen, the library row for that food is updated on save (`onUpdateLibrary`). Editing the amount or display name does not update the library.

---

## Data Model

All data lives in Supabase Postgres. Each table has RLS enabled with a `auth.uid() = user_id` policy. Local state in React mirrors the DB for instant updates; mutations are optimistic with background writes (`.catch(console.error)`).

### `logs`

```
id              text primary key
user_id         uuid (auth.users)
timestamp       int8           -- epoch ms
name            text
image_url       text           -- thumbnail data URL, optional
calories        numeric
protein         numeric
carbs           numeric
fat             numeric
fiber           numeric default 0
model           text           -- _modelUsed at time of logging
amount          numeric        -- nullable, for entries created post-two-phase
unit            text           -- nullable
ref_amount      numeric        -- nullable
ref_unit        text           -- nullable
```

### `goals`

```
user_id         uuid primary key
calories        numeric
protein         numeric
carbs           numeric
fat             numeric
```

### `goals_history`

```
id              uuid primary key
user_id         uuid
timestamp       int8           -- 0 for the initial snapshot
calories, protein, carbs, fat
```

Used by Reports to draw the goal line against whatever the goal was on each historical day.

### `notif_settings`

```
user_id         uuid primary key
enabled         bool
times           text[]         -- ["08:00","13:00","18:00"]
nudge_enabled   bool
```

### `food_library`

```
id              uuid primary key
user_id         uuid
name            text
ref_amount      numeric
ref_unit        text
calories, protein, carbs, fat, fiber  numeric
created_at      timestamptz default now()
```

Indexed for case-insensitive uniqueness via `create unique index on food_library(user_id, lower(name))`. Because the index is functional, `supabase.upsert(..., { onConflict: ... })` cannot reference it; `saveFoodToLibrary` does a select-then-insert/update against `ilike` instead.

### Local-only keys (`localStorage`)

| Key | Value |
|---|---|
| `nutrisnap_api_key` | User's AI provider API key (per-device) |
| `nutrisnap_api_provider` | `"anthropic"` \| `"openai"` \| `"gemini"` |

---

## Features

### Log tab

- Rings showing today's calories, protein, carbs, fat vs. goals
- Progress bars for the same four nutrients
- AI nudge card: generated on first visit if any meals are logged today; can be refreshed manually; dismissed per session
- Meal log grouped by day, newest first
- Each entry shows: thumbnail (or food icon), name, amount + unit (when present), time, macros, AI model used, calorie count
- Tapping an entry's thumbnail opens a fullscreen overlay of the photo; tap anywhere or the close button to dismiss
- Inline edit: tap pencil to edit name, amount, timestamp, and macros. Changing the amount proportionally rescales calories and macros so the user doesn't have to do the math.
- Delete entry with trash icon — prompts a confirmation dialog before removing
- Badge on the Goals tab nav item when protein or calorie gap is significant

### Snap tab

**Photo input**
- Take photo (camera, with `capture="environment"`)
- Choose from gallery (no `capture` attribute)
- Image resized to 300 px max on a canvas before upload; stored as a JPEG data URL thumbnail so it survives reloads
- Preview screen before analysis
- Spinner shows "Analyzing meal components…" during the single combined analysis call

**Text input**
- Freetext field on the idle screen; submit with Enter or arrow button
- Goes directly to the analysis spinner (no preview state)

**Review screen**
- Editable meal name
- Read-only "Components" card listing every item the AI identified (e.g. `rice (200 g) · chicken thigh (130 g) · broccoli (90 g)`) — gives the user transparency into the breakdown that produced the totals
- Editable amount with unit label — changing it recalculates total macros live
- Per-unit macros card labelled "Per {refAmount} {refUnit}" (typically "Per 100 g") with 5 editable fields (calories, protein, carbs, fat, fiber); edits here update the user's `food_library` entry on save
- Read-only totals card: "Total for {amount} {unit}" with calories, protein, carbs, fat, fiber
- AI model used shown next to the "AI estimate" badge
- Save to log / Discard

**Recent meals**
- Deduped by name, unique meals from the last 3 calendar days (today + previous 2), up to 15
- Shows thumbnail, name, amount + unit, calories, protein, AI model used
- Tap to instantly re-log with a new timestamp (same macros, new ID)

### Reports tab

- Period selector: Day / Week / Month
- Four macro tiles (calories, protein, carbs, fat) — **clickable**; selecting one sets the chart metric and highlights the active tile with a tinted border. Each tile shows the period total over its target on a small second line (e.g. `0 / 210 kcal`); the target is the daily goal summed across the selected period (1 day / 7 days / days-in-month), respecting goal changes per day
- Bar chart of the selected metric per hour (day) or per day (week/month), with a dashed goal line
- Goal line reflects the goal that was active on each specific day (from `goals_history`)
- Tooltip and y-axis units adapt to the selected metric (`kcal` vs `g`)

### Goals & Settings tab

**Daily nutrition goals**
- Calories, protein, carbs, fat — each editable inline with blur-to-save
- Each save appends a timestamped snapshot to `goals_history`

**Reminders**
- Toggle daily push notifications (requests browser permission on enable)
- Three configurable reminder times (morning / afternoon / evening)
- Fires a push notification with remaining calories at each scheduled time

**AI nudges**
- Toggle to enable/disable the nudge card on the Log tab
- Nudge is context-aware (breakfast / lunch / afternoon snack / dinner) based on time of day
- Gap threshold: calories > 100, protein > 5 g, carbs > 10 g, fat > 5 g

**AI provider**
- Provider selector (Anthropic / OpenAI / Gemini)
- API key input (password field with show/hide toggle)
- Save / Clear buttons
- Link to provider's API key page

**Data**
- Export all meals to CSV (date, time, name, calories, protein, carbs, fat, fiber)
- Import meals from CSV (same column names; deduplicates by ID; quoted fields with commas supported)

**Sign out** — clears the Supabase session.

---

## PWA Behaviour

- Installable on iOS and Android via "Add to Home Screen"
- Service worker precaches all static assets
- Fonts and CDN assets (Tabler Icons) cached with CacheFirst (30-day expiry)
- New deploys activate immediately (`skipWaiting` + `clientsClaim`)
- Viewport: `maximum-scale=1, user-scalable=no, viewport-fit=cover`
- Safe area insets applied to header (`env(safe-area-inset-top)`) and nav (`env(safe-area-inset-bottom)`)
- PWA shortcut: "Log a meal" → `/?tab=snap`

---

## Proxy API (`/api/claude`)

Single `POST` endpoint. The request body extends the upstream provider's body with internal fields:

| Field | Description |
|---|---|
| `_supabaseToken` | Supabase access token; validated against `${SUPABASE_URL}/auth/v1/user` |
| `_userApiKey` | User's AI provider key. Falls back to `ANTHROPIC_API_KEY` env var if empty |
| `_provider` | `"anthropic"` \| `"openai"` \| `"gemini"` |
| `_jsonResponse` | If true, enables JSON mode for the selected provider (Gemini `responseMimeType`, OpenAI `response_format`, Anthropic relies on prefill) |

For Anthropic requests, the last message can have `{ role: 'assistant', content: '{' }` as a prefill. The proxy keeps it as-is for Anthropic (which supports prefill natively) and strips/re-prepends it for OpenAI and Gemini. The response text is always returned with the prefill included so the caller sees a complete JSON object.

Internal fields are stripped before forwarding. The response always includes `_modelUsed` indicating which model actually handled the request. The proxy logs JSON response text and length to aid debugging.

---

## Build & Deploy

```
# Local dev (UI only)
npm start

# Local dev WITH the /api/claude proxy (needed to test AI analysis locally)
# `npm start` can't serve the serverless function, so AI calls 404. Use vercel dev,
# and source .env.local first so the function inherits SUPABASE_URL / SUPABASE_ANON_KEY
# (vercel dev does not auto-load .env.local into serverless functions).
set -a; source .env.local; set +a; vercel dev --listen 3000

# Production deploy (after `npm version <bump>`)
vercel --prod
```

Build command: `npm run vercel-build`. Injects `REACT_APP_BUILD_TIME` and `REACT_APP_VERSION` (from `package.json`) at build time. Both are displayed in the bottom nav bar.

Required environment variables on Vercel:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Server-side Supabase project URL (proxy JWT validation) |
| `SUPABASE_ANON_KEY` | Server-side Supabase anon key |
| `REACT_APP_SUPABASE_URL` | Client-side Supabase URL (baked into the bundle at build) |
| `REACT_APP_SUPABASE_ANON_KEY` | Client-side Supabase anon key |
| `ANTHROPIC_API_KEY` | Optional server-side fallback key for users who haven't set their own |

**Release flow:** bump the version with `npm version patch|minor|major` (creates a tagged commit) → `vercel --prod` → push with `--follow-tags`. The tag doubles as a deploy marker so any historic deploy can be checked out by tag.

---

## E2E Tests

Playwright tests under `e2e/` drive the live deployment end-to-end:

- `e2e/snap_text.test.js` — single-call text analysis, save to log
- `e2e/edit_log.test.js` — Edit amount/timestamp on a logged entry; verify macros rescale and persistence
- `e2e/report_metrics.test.js` — Click each metric tile; verify chart switches metric

Run with `GEMINI_API_KEY=<key> npm run e2e`. Targets `BASE_URL` (defaults to `https://nutrisnap-lovat.vercel.app`).
