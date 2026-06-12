const BASE_URL = process.env.BASE_URL || 'https://nutrisnap-lovat.vercel.app';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// The standing test account reused across runs (override via env). Non-signup
// tests should sign in as this user rather than minting a fresh account.
const FIXED_EMAIL = process.env.E2E_EMAIL || 'e2e_fixed@mailinator.com';
const FIXED_PASSWORD = process.env.E2E_PASSWORD || 'TestPass123!';

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY env var is required.');
  process.exit(2);
}

async function signUpFreshUser(page, prefix = 'e2e') {
  await page.goto(BASE_URL);
  await page.waitForTimeout(2000);
  await page.evaluate(key => {
    localStorage.setItem('nutrisnap_api_provider', 'gemini');
    localStorage.setItem('nutrisnap_api_key', key);
  }, GEMINI_API_KEY);
  await page.click('text=Sign up');
  await page.waitForTimeout(400);
  const email = `${prefix}_${Date.now()}@mailinator.com`;
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'TestPass123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);
  const txt = await page.evaluate(() => document.body.innerText);
  if (!txt.includes("Today's meals") && !txt.includes('Log a meal')) {
    throw new Error(`Sign-up failed. Body: ${txt.slice(0, 300)}`);
  }
  return email;
}

// Sign in as the standing test account. LockScreen defaults to login mode, so
// no Sign up/Sign in toggle is needed. Use this for every test except those
// that specifically exercise signup/registration.
async function signInFixedUser(page, email = FIXED_EMAIL, password = FIXED_PASSWORD) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(2000);
  await page.evaluate(key => {
    localStorage.setItem('nutrisnap_api_provider', 'gemini');
    localStorage.setItem('nutrisnap_api_key', key);
  }, GEMINI_API_KEY);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);
  const txt = await page.evaluate(() => document.body.innerText);
  if (!txt.includes("Today's meals") && !txt.includes('Log a meal')) {
    throw new Error(`Sign-in failed for ${email}. Body: ${txt.slice(0, 300)}`);
  }
  return email;
}

async function logSalmonByText(page) {
  await page.click('button:has-text("Snap")');
  await page.waitForTimeout(800);
  await page.fill('input[type="text"]', 'Salmon');
  await page.click('button:has(i.ti-arrow-right)');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const t = (await page.evaluate(() => document.body.innerText)).toLowerCase();
    if (t.includes('unexpected response')) {
      throw new Error('Parse error: ' + t.split('\n').find(l => l.includes('unexpected')));
    }
    // text-transform:uppercase makes innerText return all caps in some browsers,
    // so we lowercase the haystack and match on lowercase substrings.
    if (t.includes('per 100') && t.includes('total for')) return;
  }
  throw new Error('Timed out waiting for review screen');
}

module.exports = { BASE_URL, GEMINI_API_KEY, FIXED_EMAIL, FIXED_PASSWORD, signUpFreshUser, signInFixedUser, logSalmonByText };
