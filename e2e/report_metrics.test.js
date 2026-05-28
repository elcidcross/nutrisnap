// Report tab: one labelled chart per metric, plus Day/Week/Month period switching.
const { newBrowser, signUpFreshUser, logSalmonByText, assert } = require('./_helpers');

(async () => {
  const { browser, page } = await newBrowser();
  try {
    await signUpFreshUser(page, 'report');
    await logSalmonByText(page);
    await page.click('button:has-text("Save to log")');
    await page.waitForTimeout(1800);

    await page.click('button:has-text("Report")');
    await page.waitForTimeout(1200);

    // One chart per metric, each a labelled canvas.
    const labels = await page.$$eval('canvas[role="img"]', els =>
      els.map(e => (e.getAttribute('aria-label') || '').toLowerCase()));
    assert(labels.length === 4, `4 metric charts rendered (got ${labels.length})`);
    for (const metric of ['calories', 'protein', 'carbs', 'fat']) {
      assert(labels.some(l => l.includes(metric)), `Chart present for ${metric}`);
    }

    const label = async () => (await page.evaluate(() => document.body.innerText)).toLowerCase();

    // Default period is Day → "Today".
    assert((await label()).includes('today'), 'Default period label is "Today"');

    await page.click('button:text-is("Week")');
    await page.waitForTimeout(400);
    assert((await label()).includes('this week'), 'Switching to Week shows "This week"');

    await page.click('button:text-is("Month")');
    await page.waitForTimeout(400);
    assert((await label()).includes('this month'), 'Switching to Month shows "This month"');

    await page.click('button:text-is("Day")');
    await page.waitForTimeout(400);
    assert((await label()).includes('today'), 'Switching back to Day shows "Today"');

    // Period navigation: previous from Today → Yesterday.
    await page.click('button[aria-label="Previous period"]');
    await page.waitForTimeout(400);
    assert((await label()).includes('yesterday'), 'Previous period shows "Yesterday"');
  } finally {
    await browser.close();
  }
})();
