import { supabase } from './supabase';

const PROXY = '/api/claude';

function getApiMeta() {
  return {
    _userApiKey: localStorage.getItem('nutrisnap_api_key') || '',
    _provider: localStorage.getItem('nutrisnap_api_provider') || 'anthropic',
  };
}

const MODELS = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-3.5-flash',
};

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

async function callClaude(body, retries = 2) {
  const { _provider, _userApiKey } = getApiMeta();
  const _supabaseToken = await getToken();
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Timed per-attempt so client_ms reflects the round trip of the attempt that
    // actually succeeded (not the backoff sleeps of earlier failed attempts).
    const t0 = now();
    let response;
    try {
      response = await fetch(PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, _supabaseToken, _provider, _userApiKey }),
      });
    } catch (e) {
      // fetch() rejects (no HTTP response at all) on a network-level failure —
      // e.g. a dropped cellular upload, which iOS Safari surfaces as the opaque
      // "Load failed". Retry these like a transient 503; only surface a friendly
      // message once the retries are exhausted.
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw Object.assign(new Error('Network error — check your connection and try again.'),
        { _perf: { attempts: attempt + 1, status: 0 } });
    }
    if (response.status === 401) {
      await supabase.auth.signOut();
      window.dispatchEvent(new Event('nutrisnap_unauthorized'));
      throw new Error('Unauthorized');
    }
    if (response.status === 413) {
      throw Object.assign(new Error('Photo is too large to upload. Try retaking at a lower resolution.'),
        { _perf: { attempts: attempt + 1, status: 413 } });
    }
    if ((response.status === 429 || response.status === 529 || response.status === 503) && attempt < retries) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(data.error || `Server error ${response.status}`),
        { _perf: { ...(data._perf || {}), attempts: attempt + 1, status: response.status } });
    }
    // Stash client-measured timing for the perf_log row; merged with the server's
    // _perf by the analyze* callers below.
    data._clientPerf = { clientMs: Math.round(now() - t0), attempts: attempt + 1, status: 200 };
    return data;
  }
}

function getModel() {
  const provider = localStorage.getItem('nutrisnap_api_provider') || 'anthropic';
  return MODELS[provider] || MODELS.anthropic;
}

// Extract the first complete JSON object from a string using balanced brackets.
// Tracks both `{}` and `[]` on a stack so nesting through arrays (e.g. the
// `components` array) is counted correctly. If the JSON is truncated (stack
// not empty at end), attempts repair by trimming at the last complete-value
// boundary and closing every still-open bracket in the right order.
function extractJson(str, allowRepair = false) {
  const start = str.indexOf('{');
  if (start === -1) return null;
  const stack = []; // open brackets, innermost last: '{' or '['
  let inStr = false, esc = false;
  let lastSafe = -1, lastSafeStack = null; // last `,` boundary + the open brackets there
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') { stack.pop(); if (stack.length === 0) return str.slice(start, i + 1); }
    else if (c === ',' && stack.length) { lastSafe = i; lastSafeStack = stack.slice(); }
  }
  if (!allowRepair || stack.length === 0) return null;
  // Repair truncated JSON: trim at the last complete value and close every
  // bracket that was open there, innermost first.
  if (lastSafe > 0 && lastSafeStack) {
    const closers = lastSafeStack.map(b => (b === '{' ? '}' : ']')).reverse().join('');
    return str.slice(start, lastSafe) + closers;
  }
  return null;
}

// Callers expect a single object. If the model returned `[{...}]` (ignoring the
// `{` prefill and wrapping in an array), unwrap to the first element.
function unwrap(parsed) {
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
    return parsed[0];
  }
  return parsed;
}

export function parseJson(raw) {
  // Strip control chars (except \n, \r, \t) that can break JSON.parse
  // eslint-disable-next-line no-control-regex
  let cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Repair `{[...` — model ignored the `{` prefill and emitted an array instead
  if (/^\s*\{\s*\[/.test(cleaned)) cleaned = cleaned.replace(/^\s*\{/, '');
  const normalized = cleaned.replace(/'([^']*)'/g, '"$1"');
  for (const str of [cleaned, normalized]) {
    try { return unwrap(JSON.parse(str)); } catch {}
    const extracted = extractJson(str);
    if (extracted) try { return unwrap(JSON.parse(extracted)); } catch {}
  }
  // Last resort: try to repair truncated JSON
  for (const str of [cleaned, normalized]) {
    const repaired = extractJson(str, true);
    if (repaired) try {
      console.warn('Repaired truncated JSON:', repaired);
      return unwrap(JSON.parse(repaired));
    } catch {}
  }
  console.error('AI raw response (full):', raw);
  throw new Error(`AI returned unexpected response: ${raw.slice(0, 200)}`);
}

const SCHEMA_BLOCK = `Respond with ONLY a raw JSON object — no markdown, no explanation, no extra text:
{
  "name": "<concise meal description, e.g. 'chicken rice bowl with broccoli'>",
  "components": [
    {"name":"<food item>","amount":<grams>,"unit":"g"}
  ],
  "amount": <total weight in grams>,
  "unit": "g",
  "servingUnit": "<natural counting unit if this food is normally eaten as discrete pieces (e.g. 'slice' for bread, 'egg', 'cookie', 'piece', 'cup'), otherwise null>",
  "servingGrams": <approximate weight in grams of ONE servingUnit, or null if servingUnit is null>,
  "calories": <total kcal>,
  "protein": <total g>,
  "carbs": <total g>,
  "fat": <total g>,
  "fiber": <total g>
}`;

const RULES = `Identify EVERY visible component — rice, protein, vegetables, sauces, oils, dressings, cooking fats, garnishes. Do NOT collapse the meal to just its dominant item. Estimate each component's portion in grams, then sum macronutrients across all components.

Be generous with sauces, oils, butter, dressings, and cooking fats — they often dominate calories and are easy to underestimate visually.

For "amount" always give the TOTAL weight in grams. Additionally, if the food is one people naturally count in discrete pieces rather than weigh (bread → slices, eggs → eggs, cookies, pizza slices, etc.), set "servingUnit" to that unit and "servingGrams" to the typical weight of one piece; otherwise set both to null.`;

// Build messages with assistant prefill of `{` so Anthropic models start with raw JSON.
// The prefill is prepended to the response by the proxy before returning.
function jsonMessages(userContent) {
  return [
    { role: 'user', content: userContent },
    { role: 'assistant', content: '{' },
  ];
}

function cleanRaw(text) {
  return text.replace(/```json|```/g, '').trim();
}

// Single-call analysis: identify all components, estimate portions, and return total macros.
export async function analyzeFood(base64, mimeType) {
  const data = await callClaude({
    model: getModel(),
    max_tokens: 4096,
    _jsonResponse: true,
    messages: jsonMessages([
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
      { type: 'text', text: `Analyze this entire meal and estimate its macronutrients.\n\n${RULES}\n\n${SCHEMA_BLOCK}` }
    ]),
  });
  const raw = cleanRaw(data.content.map(b => b.text || '').join(''));
  return { ...parseJson(raw), _modelUsed: data._modelUsed, _perf: { ...(data._perf || {}), ...(data._clientPerf || {}) } };
}

export async function analyzeFoodText(description) {
  const data = await callClaude({
    model: getModel(),
    max_tokens: 4096,
    _jsonResponse: true,
    messages: jsonMessages(`Analyze this meal description: "${description}"\n\nIdentify every component the user named (or that's typical of the dish if generic). For dishes named without an explicit quantity (e.g. "salmon", "burger"), assume a typical single-serving portion. ${RULES}\n\n${SCHEMA_BLOCK}`),
  });
  const raw = cleanRaw(data.content.map(b => b.text || '').join(''));
  return { ...parseJson(raw), _modelUsed: data._modelUsed, _perf: { ...(data._perf || {}), ...(data._clientPerf || {}) } };
}

export async function getNudge(todayTotals, goals) {
  const gaps = {};
  if (goals.calories - todayTotals.calories > 100) gaps.calories = Math.round(goals.calories - todayTotals.calories);
  if (goals.protein - todayTotals.protein > 5) gaps.protein = Math.round((goals.protein - todayTotals.protein) * 10) / 10;
  if (goals.carbs - todayTotals.carbs > 10) gaps.carbs = Math.round((goals.carbs - todayTotals.carbs) * 10) / 10;
  if (goals.fat - todayTotals.fat > 5) gaps.fat = Math.round((goals.fat - todayTotals.fat) * 10) / 10;
  if (Object.keys(gaps).length === 0) return { text: "You've hit all your goals today! Great work.", gaps: {} };

  const hour = new Date().getHours();
  const mealCtx = hour < 11 ? 'breakfast' : hour < 14 ? 'lunch' : hour < 17 ? 'afternoon snack' : hour < 21 ? 'dinner' : 'late evening';
  const remainingMeals = hour < 11 ? 'breakfast, lunch, and dinner' : hour < 14 ? 'lunch and dinner' : hour < 17 ? 'a snack and dinner' : hour < 21 ? 'dinner' : 'a small late snack';

  const prompt = `You're a nutrition coach. The user logs meals throughout the day and needs concrete advice on what to eat to close their remaining nutrition gaps before bed.

Remaining gaps today (what they still need on top of what they've eaten):
${JSON.stringify(gaps)}

Time now: ${hour}:00 (${mealCtx}). Meals left to use: ${remainingMeals}.

Write a single, specific recommendation in 2-3 short sentences (max 60 words). You MUST include:
1. **Specific foods with portion sizes in grams or standard units** — not vague ("chicken") but exact ("180g grilled chicken breast", "2 large eggs", "1 cup Greek yogurt").
2. **What it adds**, in grams, so the user can see how it dents the gap (e.g. "~45g protein, 8g fat").
3. **When to eat it** — now / with ${mealCtx} / before bed.

Prioritize the largest gap first. If protein is the gap, lead with high-protein whole foods (chicken breast, Greek yogurt, eggs, cottage cheese, tuna, lentils). If calories are also short, pair with a calorie-dense side (rice, oats, avocado, nuts, olive oil). Avoid generic phrases like "a balanced meal" or "some protein" — always name foods and grams.

Return ONLY the recommendation text. No preamble, no markdown, no quotation marks.`;

  const data = await callClaude({
    model: getModel(),
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  });
  return { text: data.content.map(b => b.text || '').join('').trim(), gaps };
}

// The AI "teacher's note" on a weekly Report Card. `context` comes from
// buildNoteContext (src/utils/reportcard.js); `persona` sets the tone.
const NOTE_PERSONA = {
  tough: 'a blunt, demanding tough-love teacher who holds the student to a high bar — call out the slacking directly, but you want them to win',
  encouraging: 'a warm, encouraging teacher — lead with what went well, then frame the gaps gently and hopefully',
  analytical: 'a neutral, data-driven coach — no emotion; state plainly what the numbers say and the single highest-leverage change',
};
const NOTE_NAME = { tough: 'the tough-love teacher', encouraging: 'the encouraging teacher', analytical: 'the analytical coach' };

export async function getReportCardNote(context, persona = 'analytical') {
  const tone = NOTE_PERSONA[persona] || NOTE_PERSONA.analytical;
  const prompt = `You are ${tone}. You write the comment on a student's weekly health "report card".

Grades run A+ (best) to F (worst). For Nutrition, each macro shows the average per logged day vs the daily target, and "want" says whether more or less is better. Activity habits show this week's total vs the weekly target. Goals carry a deadline and recent readings (value + how many days ago) so you can work out the pace.

This week's data:
${JSON.stringify(context, null, 2)}

Write the comment: about 3 sentences, 50–60 words. Cover (1) how the week went against the targets, (2) if there are goals, whether the current effort is on pace to hit the goal by its deadline — do the simple math from the recent readings and say if they'll make it, (3) one specific, concrete next step. Mention the multi-week trend only if it's notable. Stay fully in character as ${NOTE_NAME[persona] || NOTE_NAME.analytical}. Return ONLY the comment text — no greeting, no markdown, no quotation marks.`;

  const data = await callClaude({
    model: getModel(),
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  return { text: data.content.map(b => b.text || '').join('').trim(), _modelUsed: data._modelUsed };
}
