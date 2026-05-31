# E2E tests

Playwright tests that drive the live deployment end-to-end: sign up, log meals
via Gemini, edit entries, navigate. Each test is self-contained, signs up a
throwaway account, and runs against `BASE_URL` (defaults to the production URL).

## Setup

```bash
scripts/dev build           # one-time — Playwright + Chromium are baked into the image
scripts/dev npm install     # one-time — installs playwright into the named-volume node_modules
```

## Run

```bash
GEMINI_API_KEY=<key> scripts/dev npm run e2e
# or run one file:
GEMINI_API_KEY=<key> scripts/dev node e2e/snap_text.test.js
# against the local dev server (same container):
BASE_URL=http://localhost:3000 GEMINI_API_KEY=<key> scripts/dev npm run e2e
```

`GEMINI_API_KEY` is required because the test sets it in localStorage before
sign-up so the AI proxy has something to call. Tests fail fast if it's missing.
`scripts/dev` forwards `GEMINI_API_KEY` and `BASE_URL` from the host shell into
the container at container-start time.

## Tests

- `snap_text.test.js` — Phase 1 + Phase 2 analysis from a text query ("Salmon"),
  save to log, re-analyze the same food and confirm Phase 2 is skipped (library
  cache hit).
- `edit_log.test.js` — Edit a logged entry: rename, change amount (verify macros
  rescale proportionally), change timestamp; reload and verify persistence.
- `report_metrics.test.js` — Verify the Report tab renders one labelled chart per
  metric (calories/protein/carbs/fat) and that the Day/Week/Month period tabs and
  previous-period navigation update the period label.
