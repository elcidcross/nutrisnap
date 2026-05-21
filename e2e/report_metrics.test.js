// Click each macro tile on the Report tab and verify the chart switches metric.
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

    const initialLabel = await page.$eval('canvas#reportChart', el => el.getAttribute('aria-label'));
    assert(/calories/i.test(initialLabel), `Default chart shows Calories (label: "${initialLabel}")`);

    // Tiles are buttons with aria-pressed; the second one is protein
    const tiles = await page.$$('button[aria-pressed]');
    assert(tiles.length === 4, `4 macro tiles rendered (got ${tiles.length})`);

    for (const [idx, metric] of [[1, 'protein'], [2, 'carbs'], [3, 'fat']]) {
      await tiles[idx].click();
      await page.waitForTimeout(400);
      const lbl = await page.$eval('canvas#reportChart', el => el.getAttribute('aria-label'));
      assert(lbl.toLowerCase().includes(metric), `Chart switched to ${metric} (label: "${lbl}")`);
      const pressed = await page.$$eval('button[aria-pressed="true"]', els => els.length);
      assert(pressed === 1, `Exactly one tile is active after clicking ${metric} (got ${pressed})`);
    }
  } finally {
    await browser.close();
  }
})();
