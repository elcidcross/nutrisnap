// Single-call text-input analysis: identify components, estimate totals, save to log.
const { test, expect } = require('@playwright/test');
const { signUpFreshUser, logSalmonByText } = require('./_helpers');

test('text-input analysis runs a single AI call and saves to the log', async ({ page }) => {
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await signUpFreshUser(page, 'snap_text');

  let analysisCalls = 0;
  page.on('request', req => {
    if (req.url().includes('/api/claude')) {
      const body = req.postData() || '';
      if (body.includes('Analyze this meal description')) analysisCalls++;
    }
  });

  await logSalmonByText(page);

  // Single combined call replaces the old two-phase flow
  expect(analysisCalls, `Analysis called exactly once on first request (got ${analysisCalls})`).toBe(1);

  await page.click('button:has-text("Save to log")');
  await page.waitForTimeout(2000);

  const logTxt = await page.evaluate(() => document.body.innerText);
  expect(/salmon/i.test(logTxt) && /\d+\s*kcal/i.test(logTxt), 'Salmon entry visible in log with a kcal value').toBeTruthy();
});
