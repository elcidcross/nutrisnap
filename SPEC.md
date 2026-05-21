# NutriSnap — Product Specification

## Overview

NutriSnap is a mobile-first progressive web app (PWA) for tracking daily nutrition. Users photograph meals or type descriptions to get instant AI-estimated macros. The app stores logs locally, tracks progress against user-defined goals, and offers AI-generated nudges throughout the day.

Live: https://nutrisnap-lovat.vercel.app  
Version: 1.1.0

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18, Create React App |
| Charting | Chart.js 4 |
| Service worker | Workbox 7 (CRA precaching + custom caching) |
| Serverless proxy | Vercel (`api/claude.js`) |
| Storage | `localStorage` only — no backend database |
| Hosting | Vercel |

All AI calls go through the serverless proxy, which validates the app password, strips internal fields, and routes to the selected AI provider.

---

## Authentication

- Single shared app password stored in `localStorage` as `nutrisnap_auth`
- On load, the LockScreen is shown if `nutrisnap_auth` is absent
- The password is verified server-side via an `_authOnly` request to `/api/claude` — no AI call is made, just the password check
- If the server ever returns 401, the stored password is cleared and the LockScreen is shown again
- The app password is set via the `APP_PASSWORD` environment variable on Vercel

---

## AI Providers

The user selects a provider and enters their own API key in Settings. The key is stored in `localStorage` and sent to the proxy on every request.

| Provider | Model | Notes |
|---|---|---|
| Google Gemini | `gemini-3.5-flash` | Default. Falls back to `gemini-2.5-flash` on 503 |
| Anthropic | `claude-haiku-4-5-20251001` | Vision supported |
| OpenAI | `gpt-4o-mini` | Vision supported |

**Fallback behaviour:** When Gemini 3.5 Flash returns 503 (overloaded), the proxy silently retries the same request with Gemini 2.5 Flash. The model actually used is recorded in the log entry and shown in the UI.

**Retry behaviour:** The client retries any 429, 503, or 529 response up to twice, with 1 s and 2 s delays.

---

## Data Model

All data is stored in `localStorage`. Keys are versioned to avoid stale-data conflicts.

### Log entry (`nutrisnap_logs_v3`)

```json
{
  "id": "string (base36 timestamp + random)",
  "timestamp": 1700000000000,
  "name": "string",
  "imageUrl": "string (data URL of thumbnail, optional)",
  "calories": 350,
  "protein": 28.5,
  "carbs": 42.0,
  "fat": 8.0,
  "fiber": 4.0,
  "model": "gemini-3.5-flash"
}
```

### Goals (`nutrisnap_goals_v1`)

```json
{ "calories": 2000, "protein": 150, "carbs": 200, "fat": 65 }
```

### Goals history (`nutrisnap_goals_history_v1`)

Array of timestamped goal snapshots. A new snapshot is appended whenever the user saves a goal change. Used by the Reports chart to draw the goal line against what the goal actually was on each past day.

```json
[
  { "timestamp": 0, "calories": 2000, "protein": 150, "carbs": 200, "fat": 65 },
  { "timestamp": 1700000000000, "calories": 2200, "protein": 160, "carbs": 220, "fat": 70 }
]
```

### Notification settings (`nutrisnap_notif_v1`)

```json
{
  "enabled": false,
  "times": ["08:00", "13:00", "18:00"],
  "nudgeEnabled": true
}
```

### Other keys

| Key | Value |
|---|---|
| `nutrisnap_auth` | App password (plaintext) |
| `nutrisnap_api_key` | User's AI provider API key |
| `nutrisnap_api_provider` | `"anthropic"` \| `"openai"` \| `"gemini"` |

---

## Features

### Log tab

- Rings showing today's calories, protein, carbs, fat vs. goals
- Progress bars for the same four nutrients
- AI nudge card: generated on first visit if any meals are logged today; can be refreshed manually; dismissed per session
- Meal log grouped by day, newest first
- Each entry shows: thumbnail (or food icon), name, time, macros, AI model used, calorie count
- Inline edit: tap pencil to edit name, calories, protein, carbs, fat inline
- Delete entry with trash icon
- Badge on the Goals tab nav item when protein or calorie gap is significant

### Snap tab

**Photo input**
- Take photo (camera, with `capture="environment"`)
- Choose from gallery (no `capture` attribute)
- Image resized to 300 px max on a canvas before upload; stored as a JPEG data URL thumbnail so it survives page reloads
- Preview screen before analysis
- Spinner during analysis

**Text input**
- Freetext field on the idle screen; submit with Enter or arrow button
- Goes directly to the review screen (no preview state)

**Review screen**
- Editable meal name
- Editable macro inputs: calories (full width), protein, carbs, fat, fiber (2-column grid)
- AI model used shown next to the "AI estimate" badge
- Save to log / Discard

**Recent meals**
- Deduped by name, up to 5 most recent unique meals
- Shows thumbnail, name, calories, protein, and AI model used
- Tap to instantly re-log with a new timestamp (same macros, new ID)

### Reports tab

- Period selector: Day / Week / Month
- Summary tiles: total kcal, protein, carbs, fat for the period
- Bar chart: calorie intake per hour (day) or per day (week/month)
- Goal line on chart reflects the goal that was active on each specific day (from goals history)

### Goals & Settings tab

**Daily nutrition goals**
- Calories, protein, carbs, fat — each editable inline with blur-to-save
- Each save appends a timestamped snapshot to goals history

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

Single `POST` endpoint. All requests include:

| Field | Description |
|---|---|
| `_password` | App password for server-side auth |
| `_userApiKey` | User's AI provider key |
| `_provider` | `"anthropic"` \| `"openai"` \| `"gemini"` |
| `_authOnly` | If true, validates password only and returns `{ ok: true }` |
| `_jsonResponse` | If true, asks Gemini to respond as `application/json` |

Internal fields are stripped before forwarding to the AI provider. The response always includes `_modelUsed` indicating which model actually handled the request.

---

## Build & Deploy

```
# Local dev
npm start

# Production deploy
vercel --prod
```

Build command: `npm run vercel-build`  
Injects `REACT_APP_BUILD_TIME` and `REACT_APP_VERSION` (from `package.json`) at build time. Both are displayed in the bottom nav bar.

Required environment variables on Vercel:

| Variable | Description |
|---|---|
| `APP_PASSWORD` | Shared app password |
| `ANTHROPIC_API_KEY` | Optional server-side fallback key (Anthropic only) |
