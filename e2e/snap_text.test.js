// Phase 1 + Phase 2 text-input analysis, save to log, library cache hit on re-analyze.
const { newBrowser, signUpFreshUser, logSalmonByText, assert } = require('./_helpers');

(async () => {
  const { browser, page } = await newBrowser();
  try {
    await signUpFreshUser(page, 'snap_text');

    let phase2Calls = 0;
    page.on('request', req => {
      if (req.url().includes('/api/claude')) {
        const body = req.postData() || '';
        if (body.includes('macronutrients for')) phase2Calls++;
      }
    });

    await logSalmonByText(page);

    // First analysis — Phase 2 must have run (no cache yet)
    assert(phase2Calls === 1, `Phase 2 called once on first analysis (got ${phase2Calls})`);

    await page.click('button:has-text("Save to log")');
    await page.waitForTimeout(2000);

    const logTxt = await page.evaluate(() => document.body.innerText);
    assert(/salmon/i.test(logTxt) && logTxt.includes('208 kcal'), 'Salmon entry visible in log with 208 kcal');

    // Re-analyze — must NOT call Phase 2 (library cache hit)
    phase2Calls = 0;
    await logSalmonByText(page);
    assert(phase2Calls === 0, `Phase 2 skipped on cached re-analysis (got ${phase2Calls})`);
  } finally {
    await browser.close();
  }
})();
