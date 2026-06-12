// Edit a logged entry: change amount (verify macros rescale), change timestamp,
// reload and verify persistence to Supabase.
const { test, expect } = require('@playwright/test');
const { signUpFreshUser, logSalmonByText } = require('./_helpers');

test('editing an entry rescales macros, updates time, and persists across reload', async ({ page }) => {
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await signUpFreshUser(page, 'edit_log');
  await logSalmonByText(page);
  await page.click('button:has-text("Save to log")');
  await page.waitForTimeout(1800);

  await page.click('button[aria-label="Edit entry"]');
  await page.waitForTimeout(400);

  const editTxt = await page.evaluate(() => document.body.innerText);
  expect(editTxt.includes('AMOUNT'), 'AMOUNT field visible in edit mode').toBeTruthy();
  expect(editTxt.includes('WHEN'), 'WHEN field visible in edit mode').toBeTruthy();

  // Input order: amount, calories, protein, carbs, fat
  const numInputs = await page.$$('input[type="number"]');
  expect(numInputs.length >= 5, `Edit form has at least 5 number inputs (got ${numInputs.length})`).toBeTruthy();

  const [amtBefore, calBefore, protBefore] = await Promise.all([
    numInputs[0].inputValue(), numInputs[1].inputValue(), numInputs[2].inputValue(),
  ]);

  // Double the amount → macros must double
  await numInputs[0].fill(String(+amtBefore * 2));
  await page.waitForTimeout(200);
  const [calAfter, protAfter] = await Promise.all([numInputs[1].inputValue(), numInputs[2].inputValue()]);
  expect(+calAfter === +calBefore * 2, `Calories doubled (${calBefore} → ${calAfter})`).toBeTruthy();
  expect(Math.abs(+protAfter - +protBefore * 2) < 0.2, `Protein doubled (${protBefore} → ${protAfter})`).toBeTruthy();

  // Move timestamp to yesterday 10:00 local
  const y = new Date(Date.now() - 86400000);
  const p = n => String(n).padStart(2, '0');
  const stamp = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}T10:00`;
  await page.fill('input[type="datetime-local"]', stamp);

  await page.click('button:has-text("Save")');
  await page.waitForTimeout(2500);

  const afterTxt = await page.evaluate(() => document.body.innerText);
  expect(afterTxt.includes(`${+amtBefore * 2} g`), 'New amount visible in log').toBeTruthy();
  expect(afterTxt.includes('10:00 AM') || afterTxt.includes('10:00'), 'New time visible in log').toBeTruthy();

  // Reload and verify persistence
  await page.reload();
  await page.waitForTimeout(3000);
  const reloadTxt = await page.evaluate(() => document.body.innerText);
  expect(reloadTxt.includes(`${+amtBefore * 2} g`), 'Edited amount persisted to DB after reload').toBeTruthy();
});
