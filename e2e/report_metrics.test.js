// Report tab: one labelled chart per metric, plus Day/Week/Month period switching.
const { test, expect } = require('@playwright/test');
const { signUpFreshUser, logSalmonByText } = require('./_helpers');

test('report tab renders one chart per metric and switches periods', async ({ page }) => {
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await signUpFreshUser(page, 'report');
  await logSalmonByText(page);
  await page.click('button:has-text("Save to log")');
  await page.waitForTimeout(1800);

  await page.click('button:has-text("Report")');
  await page.waitForTimeout(1200);

  // One chart per metric, each a labelled canvas.
  const labels = await page.$$eval('canvas[role="img"]', els =>
    els.map(e => (e.getAttribute('aria-label') || '').toLowerCase()));
  expect(labels.length === 4, `4 metric charts rendered (got ${labels.length})`).toBeTruthy();
  for (const metric of ['calories', 'protein', 'carbs', 'fat']) {
    expect(labels.some(l => l.includes(metric)), `Chart present for ${metric}`).toBeTruthy();
  }

  const label = async () => (await page.evaluate(() => document.body.innerText)).toLowerCase();

  // Default period is Day → "Today".
  expect((await label()).includes('today'), 'Default period label is "Today"').toBeTruthy();

  await page.click('button:text-is("Week")');
  await page.waitForTimeout(400);
  expect((await label()).includes('this week'), 'Switching to Week shows "This week"').toBeTruthy();

  await page.click('button:text-is("Month")');
  await page.waitForTimeout(400);
  expect((await label()).includes('this month'), 'Switching to Month shows "This month"').toBeTruthy();

  await page.click('button:text-is("Day")');
  await page.waitForTimeout(400);
  expect((await label()).includes('today'), 'Switching back to Day shows "Today"').toBeTruthy();

  // Period navigation: previous from Today → Yesterday.
  await page.click('button[aria-label="Previous period"]');
  await page.waitForTimeout(400);
  expect((await label()).includes('yesterday'), 'Previous period shows "Yesterday"').toBeTruthy();
});
