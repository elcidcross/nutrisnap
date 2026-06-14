# NutriSnap — Product Specification

## Overview

NutriSnap is a mobile-first progressive web app (PWA) for tracking daily nutrition. Users photograph meals or type descriptions to get instant AI-estimated macros. All logs, goals, and the per-user food library are stored in Supabase so data syncs across devices. The app tracks progress against user-defined goals and offers AI-generated nudges throughout the day.

Live: https://nutrisnap-lovat.vercel.app
Version: 1.4.3

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

**Initial load ("Loading your data").** On login the app runs five queries in parallel (`getLogs`, `getGoals`, `getGoalsHistory`, `getNotifSettings`, `getFoodLibrary`), so the wait is the slowest single query. The four small ones are ~one network round-trip each; `getLogs` is the only one whose payload grows with usage, because `image_url` holds an inline base64 thumbnail (~10 KB/meal). To keep load time flat as history grows, `getLogs` selects every column **except** `image_url`; thumbnails are fetched separately by `getLogImages` after the UI has rendered and merged into `logs` state by id. Rows render with a placeholder food icon until their thumbnail backfills (typically within a few hundred ms). Logs added during the session already carry their own thumbnail, so the merge only overwrites ids present in the fetched set.

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
ref_amount      numeric        -- always 100 for new rows (macros are per-100g)
ref_unit        text           -- always 'g' for new rows
calories, protein, carbs, fat, fiber  numeric  -- per ref_amount ref_unit (i.e. per 100 g)
unit_label      text           -- natural counting unit, e.g. 'slice' (NULL = weigh only)
unit_grams      numeric        -- approx grams in one unit_label (e.g. 30 for a slice)
created_at      timestamptz default now()
```

`unit_label`/`unit_grams` (migration `sql/food_library_units.sql`) let a food remember the unit it's naturally counted in. Macros are always stored per-100g; the natural unit is purely an input/display convenience used by the Snap review screen.

Indexed for case-insensitive uniqueness via `create unique index on food_library(user_id, lower(name))`. Because the index is functional, `supabase.upsert(..., { onConflict: ... })` cannot reference it; `saveFoodToLibrary` does a select-then-insert/update against `ilike` instead.

### `objectives`

Deadline-based achievement goals for the cross-app Goals hub (see Goals app below). Distinct from `app_goals`, which holds standing per-app target values overlaid on Report charts.

```
id          uuid primary key
user_id     uuid
title       text           -- optional custom label; else derived from app/metric/target
app         text           -- source app id: 'body' | 'jog' | 'meditation' | 'workout' | 'nutrisnap'
metric      text           -- field key: 'body_fat' | 'distance' | 'days' | 'sessions' | 'calories' ...
type        text           -- 'reach' | 'accumulate' | 'streak'
target      numeric        -- reach: target reading; accumulate: total per period; streak: sessions per period
direction   text           -- reach only: 'down' | 'up' (is lower or higher the win?)
baseline    numeric        -- reach only: metric snapshot at creation (progress denominator)
period      text           -- accumulate/streak: 'day' | 'week' | 'month'; reach: null
due_ts      int8           -- reach: deadline (epoch ms); recurring: null
status      text           -- reach: 'active'|'achieved'|'missed' (latched); recurring: always 'active'
created_at  timestamptz
```

Migration: `sql/objectives.sql`. Progress is **never stored** — it is computed live from each source app's own entries by `src/utils/goals.js`. Only the `reach` verdict latches (into `status`).

### Local-only keys (`localStorage`)

| Key | Value |
|---|---|
| `nutrisnap_api_key` | User's AI provider API key (per-device) |
| `nutrisnap_api_provider` | `"anthropic"` \| `"openai"` \| `"gemini"` |
| `nutrisnap_snap_draft` | In-progress (reviewed-but-unsaved) analysis; see Review screen below |

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
- Editable amount with a **unit toggle** (`grams` ⇄ a natural counting unit). The AI picks the most appropriate unit for the food (e.g. bread → `slice`, eggs → `egg`); when it returns a `servingUnit`/`servingGrams` the review screen defaults to that unit. The user can switch units at any time — toggling keeps the logged total weight constant. Changing the amount recalculates total macros live.
- When a counting unit is active: the amount is in that unit (e.g. "2 slices"), the unit name is editable inline, and an editable **"1 {unit} ≈ N g"** field sets the piece weight. Internally macros are kept per-100g (the nutritional source of truth); the per-unit card and totals derive from it, so editing the piece weight rescales the per-piece macros and totals while the per-100g density stays fixed.
- Per-unit macros card labelled "Per 100 g" (grams mode) or "Per 1 {unit}" (counting mode) with 4 editable fields (calories, protein, carbs, fat); edits here update the user's `food_library` entry (always stored per-100g) on save, along with the food's `unit_label`/`unit_grams`. Fiber is intentionally not shown or editable on this screen, but the AI's fiber estimate is still scaled by amount and saved to the log (and so still appears in the Log/Reports)
- Read-only totals card: "Total for {amount} {unit}" (counting mode also shows the equivalent grams) with calories, protein, carbs, fat
- **Logs are always saved in grams.** A counting-unit entry (e.g. 2 slices @ 30 g) is converted to its gram total (60 g) on save, so the log/history and edit screens stay uniformly gram-based
- AI model used shown next to the "AI estimate" badge
- Save to log / Discard
- **Crash/lock recovery:** while on this screen the analysis (name, amount, per-unit macros, components, model, thumbnail) is mirrored to `localStorage` under `nutrisnap_snap_draft`, including every inline edit. If the page is reloaded or evicted before saving — e.g. iOS Safari discarding the tab when the phone locks — the draft is restored on next mount with a "Restored your last analysis" badge. The draft is cleared on Save to log or Discard, and ignored if older than 24h. The full-resolution photo is not stored (only the small thumbnail), so a lock *during* the analyzing spinner is not recovered — the user re-takes the photo.

**Recent meals**
- Deduped by name, unique meals from the last 3 calendar days (today + previous 2), up to 15
- Shows thumbnail, name, amount + unit, calories, protein, AI model used
- Tap to instantly re-log with a new timestamp (same macros, new ID)

### Reports tab

- Period selector: Day / Week / Month
- Period navigation: prev/next arrows step the viewed window backward/forward (e.g. yesterday, last week, April). The centered label shows the window ("Today", "Yesterday", "May 11 – 17", "April 2026") and is tappable to jump back to the current period; forward navigation is disabled at the current period (no future). All charts reflect the viewed window. Switching Day/Week/Month resets to the current period
- All four metrics (calories, protein, carbs, fat) are shown at once as a vertical stack of compact bar charts — there is no metric selector. Each chart has a header with the metric name (color swatch) and the period total over its target (e.g. `1500 / 2000 kcal`); the target is the daily goal summed across the period (1 day / 7 days / days-in-month), respecting goal changes per day
- Each chart bars the metric per hour (day) or per day (week/month), with a dashed goal line reflecting the goal active on each specific day (from `goals_history`). Tooltip and units adapt per metric (`kcal` vs `g`)

### Targets & Settings tab

(Tab labelled **Targets**.)

**Daily nutrition targets**
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

### Goals app

The product's *ends*: app-measured **outcomes with a deadline** (e.g. *16% body fat by Jul 14*). Goals are sourced from **Body** metrics only (weight / body fat / muscle mass) and stored as `reach` objectives whose verdict latches to achieved/missed. The recurring *means* (habits) are **not** here — they live in each source app and are graded by the separate Report Card app.

The `METRICS` catalog in `src/utils/goals.js` tags each app's fields as `kind: 'goal'` (Body) or `kind: 'habit'`; `appsWithKind('goal')`/`metricsByKind` scope the goal add sheet.

**Progress engine** (`src/utils/goals.js`, pure + unit-tested in `goals.test.js`):
- `reach` progress = `(baseline − current) / (baseline − target)` (works both directions). Status: `achieved` when the target is crossed, `missed` once the deadline passes unmet, else `onTrack`/`behind` by comparing elapsed-time to progress. The verdict is latched into `objectives.status` once decided.

**UI.** Bottom nav **Active · Add · Done**. Each goal is a card (ring % + progress bar + status line, e.g. "31 days left · on track", "Achieved 🎉"). The Add/Edit sheet picks Body metric → target → due date and snapshots the current reading as `baseline`. Goals move to **Done** once latched. Writes are optimistic (`.catch(console.error)`).

### Report Card app

A separate app that grades each week against the **habits already defined in the other apps** plus nutrition, and rolls them into one letter grade — to make adherence a game worth acing. Read-only (no creation UI).

**Where habits live.** Habits are per-app weekly targets in the `app_goals` table, set on each app's **Targets** tab: Jog's `weekly_distance`, Meditation's `weekly_days`, Workout's `weekly_sessions`. (Meditation and Workout gained a Targets tab for this.) Nutrition's "target" is the daily macro `goals`. The Report Card never defines habits itself; it reads these.

**Defaults.** Each activity habit has a real default (jog 10 km, meditate 7 days, 3 workouts/week) declared both in the app's `goals` config (shown pre-filled and editable on the Targets tab) and in `HABIT_SOURCES`. The Report Card grades against the saved value if present, else the default — so every habit is graded out of the box.

**Report card engine** (`src/utils/reportcard.js`, pure + unit-tested in `reportcard.test.js`):
- Score per item = % of the weekly target met, capped at 100%, mapped to a US letter scale (`letterFor`: A+ ≥97 … D- ≥60, F <60). Overall = mean of item scores.
- **Nutrition** is one combined grade (not four): protein is a floor (≥ target), calories/carbs/fat are ceilings (≤ target, overage penalized), averaged over the days the user actually logged. Uses the goal active each day (`goals_history`).
- **Per-app habits** (`HABIT_SOURCES`): each app's `app_goals` target (or default) graded against the week's actual — a summed field (`distance`), a count of distinct logged days (`days`), or a count of sessions.
- **N/A:** a habit (or nutrition) with **nothing recorded** that week is marked `na` — shown as **N/A**, not graded F, and excluded from the overall average. The overall is the mean of the graded items only; a week with nothing recorded at all has no overall and is dropped from history.

**UI.** Cards are labelled by **week number** (`weekLabel` → "Week 24", ISO-8601 numbering read off the week's Thursday) with the date range as a subtitle (`weekRange`). This week's big overall grade sits above a per-habit breakdown (label · actual/target · bar · letter); each history row (last 8 weeks) is **tappable to expand** its full breakdown. Read-only, and **re-fetches on every activation** (it aggregates other apps' data, which may change mid-session).

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

All local commands run inside the Podman container via `scripts/dev` (see [`scripts/dev`](scripts/dev) for the exact `podman run` invocation). The host's `.env.local` / `.env.e2e.local` are injected via `--env-file` when the container is started, so `vercel dev` sees `SUPABASE_URL` / `SUPABASE_ANON_KEY` without an extra `source` step.

```
# Local dev (UI only)
scripts/dev npm start

# Local dev WITH the /api/claude proxy (needed to test AI analysis locally)
# `npm start` can't serve the serverless function, so AI calls 404. Use vercel dev
# and bind to 0.0.0.0 so the host's port forward sees it.
scripts/dev vercel dev --listen 0.0.0.0:3000
```

Production deploys are automatic: every push to `main` on GitHub triggers a Vercel production build; every push to another branch gets a preview URL. To force a one-off deploy from your machine without pushing you can still run `vercel --prod`.

Build command: `npm run vercel-build`. Injects `REACT_APP_BUILD_TIME` and `REACT_APP_VERSION` (from `package.json`) at build time. Both are displayed in the bottom nav bar.

Required environment variables on Vercel:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Server-side Supabase project URL (proxy JWT validation) |
| `SUPABASE_ANON_KEY` | Server-side Supabase anon key |
| `REACT_APP_SUPABASE_URL` | Client-side Supabase URL (baked into the bundle at build) |
| `REACT_APP_SUPABASE_ANON_KEY` | Client-side Supabase anon key |
| `ANTHROPIC_API_KEY` | Optional server-side fallback key for users who haven't set their own |

**Release flow:** `npm version patch|minor|major` (creates a tagged commit) → `git push --follow-tags`. Vercel auto-deploys from `main`; the tag still doubles as a deploy marker so any historic deploy can be checked out by tag.

---

## E2E Tests

Playwright tests under `e2e/` drive the live deployment end-to-end:

- `e2e/snap_text.test.js` — single-call text analysis, save to log
- `e2e/edit_log.test.js` — Edit amount/timestamp on a logged entry; verify macros rescale and persistence
- `e2e/report_metrics.test.js` — Click each metric tile; verify chart switches metric

Run with `GEMINI_API_KEY=<key> npm run e2e`. Targets `BASE_URL` (defaults to `https://nutrisnap-lovat.vercel.app`).
