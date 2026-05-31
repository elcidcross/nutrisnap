# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NutriSnap is a mobile-first PWA for AI-assisted nutrition tracking. The full product spec lives in `SPEC.md` and is the canonical source for product behavior; read it before changing user-visible flows.

## Commands

All local commands run inside a Podman container via `scripts/dev` (see [`scripts/dev`](scripts/dev) for the `podman run` invocation). The host needs only `podman`, `git`, `gh`, and `vercel`. `git`/`gh`/`vercel` CLI ops are host-side; `node`/`npm`/`react-scripts`/`vercel dev`/`playwright` are container-side.

```bash
scripts/dev build                                   # build the dev image (one-time / on package*.json or Containerfile changes)
scripts/dev npm install                             # populate the nutrisnap-node-modules volume (one-time)
scripts/dev npm start                               # CRA dev server on :3000 (UI only — /api/claude will 404)
scripts/dev vercel dev --listen 0.0.0.0:3000        # dev server + serverless proxy. Container --env-file loads .env.local automatically; needs 0.0.0.0 so host port forward sees it
scripts/dev npm run build                           # production build
scripts/dev npm test -- --watchAll=false            # Jest (CRA). Currently covers src/utils/api.test.js (parseJson)
scripts/dev npm test -- -t "parses a normal"        # run a single Jest test by name
GEMINI_API_KEY=<key> scripts/dev npm run e2e        # Playwright e2e against BASE_URL (defaults to prod). Chromium is baked into the image
BASE_URL=http://localhost:3000 GEMINI_API_KEY=<key> scripts/dev node e2e/snap_text.test.js  # one e2e file against the local dev server in the same container
scripts/dev                                          # interactive shell inside the container
scripts/dev down                                     # stop+remove the container (volume + image stay)
```

`node_modules` lives in a named podman volume (`nutrisnap-node-modules`), not in the host tree — so `ls node_modules` on the host shows nothing. Run `scripts/dev npm install` (not host `npm install`) after pulling changes to `package.json`. Chromium is baked into the image at `/ms-playwright`; bumping the playwright version in package.json should be matched in `Containerfile`.

Release: `npm version patch|minor|major` (creates a tagged commit) → `git push --follow-tags`. Vercel auto-deploys from `main`; the git tag doubles as the deploy marker. `npm version` runs on the host (it commits + tags via git), not via `scripts/dev`.

## Architecture

**Frontend.** Create React App, React 18, Chart.js. Inline styles (no CSS framework). The app is a single shell (`src/App.jsx`) that owns all session state and renders one of four tab views (`LogView`, `SnapView`, `ReportView`, `SettingsView`). No router — `tab` is React state, with one PWA shortcut (`?tab=snap`) read on mount.

**Backend.** Supabase Postgres (RLS-enforced, `auth.uid() = user_id` on every table) + one Vercel serverless function at `api/claude.js` that proxies AI calls. There is **no other backend**. All client→DB traffic goes through `@supabase/supabase-js`; all client→AI traffic goes through the proxy.

**The proxy is the only AI path.** `src/utils/api.js::callClaude` always POSTs to `/api/claude` with `_supabaseToken`, `_userApiKey`, `_provider` extension fields. The proxy validates the JWT against `${SUPABASE_URL}/auth/v1/user`, strips the `_`-prefixed fields, and forwards to Anthropic / OpenAI / Gemini. A 401 from the proxy triggers `supabase.auth.signOut()` and a `nutrisnap_unauthorized` event — never bypass this path.

**Provider shape juggling.** The proxy presents an Anthropic-style request/response shape to the client (`messages: [...]`, `content: [{text}]`) regardless of provider. Anthropic-style assistant prefill (`{ role: 'assistant', content: '{' }` as the last message) is used to coerce raw JSON output; the proxy strips and re-prepends it for OpenAI/Gemini. When adding a new AI call from the client, build the body in Anthropic shape and set `_jsonResponse: true` for JSON responses.

**Optimistic mutations.** All write paths in `App.jsx` follow the pattern: update local state synchronously, fire-and-forget the DB write with `.catch(console.error)`. Don't await DB writes in handlers — the user never sees a spinner for them.

**Initial load is deliberately split.** On login, `App.jsx` runs 5 queries in parallel (`getLogs`, `getGoals`, `getGoalsHistory`, `getNotifSettings`, `getFoodLibrary`). `getLogs` intentionally **excludes** `image_url` (`LOG_COLS` in `src/utils/db.js`) because the base64 thumbnails dominate payload size. `getLogImages` runs after first paint and merges into `logs` state by id. Preserve this split when adding columns — never add a large column to `LOG_COLS`.

**Food library cache.** `food_library` is keyed by `(user_id, lower(name))` via a **functional** unique index, so Supabase's `upsert(..., { onConflict })` cannot use it. `saveFoodToLibrary` does a manual `ilike` select-then-insert/update. Don't replace this with `.upsert()`.

**Snap review screen has crash recovery.** While `SnapView` is on the review state it mirrors the in-progress analysis to `localStorage` under `nutrisnap_snap_draft` (including inline edits) and restores it on mount within 24h. The draft is cleared on Save or Discard. Only the thumbnail is mirrored (not the full-resolution photo), so a reload during the "Analyzing…" spinner cannot be recovered. Touching the review screen requires preserving this behavior.

**Per-unit macros are normalized to 100g.** After analysis, totals are scaled to `refAmount=100, refUnit='g'` so the review screen's editable card is always "Per 100 g". Editing the amount rescales totals live without re-calling the AI. Editing per-100g macros writes back to the user's `food_library` row; editing amount or name does not.

**JSON parsing is defensive.** `parseJson` in `src/utils/api.js` handles several failure modes (control chars, `{[...` prefill+array corruption, single-quoted strings, truncated JSON via balanced-bracket scan with repair). The Jest test in `src/utils/api.test.js` documents each case — when changing `parseJson`, run that test.

**Retry policy.** The client retries 429/503/529 up to 2 times with 1s and 2s backoffs. The proxy additionally falls back from `gemini-3.5-flash` to `gemini-2.5-flash` on Gemini 503. The model actually used comes back as `_modelUsed` and is surfaced in the UI — preserve this passthrough.

**Reports use goal-at-time.** `goals_history` is appended on every goal save (`addGoalsHistoryEntry`). `ReportView` draws the dashed goal line per-day based on whichever goal was active on each day — don't replace this with the current `goals` value.

## Environment

Two env files locally: `.env.local` (Vercel/Supabase secrets, sourced before `vercel dev`) and `.env.e2e.local` (e2e config). On Vercel, both `SUPABASE_URL`/`SUPABASE_ANON_KEY` (server) and `REACT_APP_SUPABASE_URL`/`REACT_APP_SUPABASE_ANON_KEY` (baked into the bundle) must be set. `ANTHROPIC_API_KEY` is an optional server-side fallback for users with no key in Settings.

## Conventions

- No CSS files for components — inline styles only. `src/index.css` holds only global resets and CSS variables.
- DB ↔ JS shape conversion is centralized in `src/utils/db.js` via `rowToLog`/`logToRow` (snake_case ↔ camelCase). Don't read/write Supabase from components; go through `db.js`.
- Tabler Icons are loaded via CDN as `<i className="ti ti-..." />`.
