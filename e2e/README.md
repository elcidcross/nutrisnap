# E2E tests

Playwright tests that drive the live deployment end-to-end: sign up, log meals
via Gemini, edit entries, navigate. Each test is self-contained, signs up a
throwaway account, and runs against `BASE_URL` (defaults to the production URL).

## Setup

```bash
npm install --no-save playwright
npx playwright install chromium
```

## Run

```bash
GEMINI_API_KEY=<key> npm run e2e
# or run one file:
GEMINI_API_KEY=<key> node e2e/snap_text.test.js
# against a different deployment:
BASE_URL=http://localhost:3000 GEMINI_API_KEY=<key> npm run e2e
```

`GEMINI_API_KEY` is required because the test sets it in localStorage before
sign-up so the AI proxy has something to call. Tests fail fast if it's missing.

## Tests

- `snap_text.test.js` — Phase 1 + Phase 2 analysis from a text query ("Salmon"),
  save to log, re-analyze the same food and confirm Phase 2 is skipped (library
  cache hit).
- `edit_log.test.js` — Edit a logged entry: rename, change amount (verify macros
  rescale proportionally), change timestamp; reload and verify persistence.
- `report_metrics.test.js` — Click the protein / carbs / fat tiles on the Report
  tab and verify the chart switches metric.
