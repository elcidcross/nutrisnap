// Edit a logged entry: change amount (verify macros rescale), change timestamp,
// reload and verify persistence to Supabase.
const { newBrowser, signUpFreshUser, logSalmonByText, assert } = require('./_helpers');

(async () => {
  const { browser, page } = await newBrowser();
  try {
    await signUpFreshUser(page, 'edit_log');
    await logSalmonByText(page);
    await page.click('button:has-text("Save to log")');
    await page.waitForTimeout(1800);

    await page.click('button[aria-label="Edit entry"]');
    await page.waitForTimeout(400);

    const editTxt = await page.evaluate(() => document.body.innerText);
    assert(editTxt.includes('AMOUNT'), 'AMOUNT field visible in edit mode');
    assert(editTxt.includes('WHEN'), 'WHEN field visible in edit mode');

    // Input order: amount, calories, protein, carbs, fat
    const numInputs = await page.$$('input[type="number"]');
    assert(numInputs.length >= 5, `Edit form has at least 5 number inputs (got ${numInputs.length})`);

    const [amtBefore, calBefore, protBefore] = await Promise.all([
      numInputs[0].inputValue(), numInputs[1].inputValue(), numInputs[2].inputValue(),
    ]);

    // Double the amount → macros must double
    await numInputs[0].fill(String(+amtBefore * 2));
    await page.waitForTimeout(200);
    const [calAfter, protAfter] = await Promise.all([numInputs[1].inputValue(), numInputs[2].inputValue()]);
    assert(+calAfter === +calBefore * 2, `Calories doubled (${calBefore} → ${calAfter})`);
    assert(Math.abs(+protAfter - +protBefore * 2) < 0.2, `Protein doubled (${protBefore} → ${protAfter})`);

    // Move timestamp to yesterday 10:00 local
    const y = new Date(Date.now() - 86400000);
    const p = n => String(n).padStart(2, '0');
    const stamp = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}T10:00`;
    await page.fill('input[type="datetime-local"]', stamp);

    await page.click('button:has-text("Save")');
    await page.waitForTimeout(2500);

    const afterTxt = await page.evaluate(() => document.body.innerText);
    assert(afterTxt.includes(`${+amtBefore * 2} g`), 'New amount visible in log');
    assert(afterTxt.includes('10:00 AM') || afterTxt.includes('10:00'), 'New time visible in log');

    // Reload and verify persistence
    await page.reload();
    await page.waitForTimeout(3000);
    const reloadTxt = await page.evaluate(() => document.body.innerText);
    assert(reloadTxt.includes(`${+amtBefore * 2} g`), 'Edited amount persisted to DB after reload');
  } finally {
    await browser.close();
  }
})();
