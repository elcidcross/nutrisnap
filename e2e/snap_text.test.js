// Single-call text-input analysis: identify components, estimate totals, save to log.
const { newBrowser, signUpFreshUser, logSalmonByText, assert } = require('./_helpers');

(async () => {
  const { browser, page } = await newBrowser();
  try {
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
    assert(analysisCalls === 1, `Analysis called exactly once on first request (got ${analysisCalls})`);

    await page.click('button:has-text("Save to log")');
    await page.waitForTimeout(2000);

    const logTxt = await page.evaluate(() => document.body.innerText);
    assert(/salmon/i.test(logTxt) && /\d+\s*kcal/i.test(logTxt), 'Salmon entry visible in log with a kcal value');
  } finally {
    await browser.close();
  }
})();
