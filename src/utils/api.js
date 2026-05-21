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

async function callClaude(body, retries = 2) {
  const { _provider, _userApiKey } = getApiMeta();
  const _supabaseToken = await getToken();
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, _supabaseToken, _provider, _userApiKey }),
    });
    if (response.status === 401) {
      await supabase.auth.signOut();
      window.dispatchEvent(new Event('nutrisnap_unauthorized'));
      throw new Error('Unauthorized');
    }
    if ((response.status === 429 || response.status === 529 || response.status === 503) && attempt < retries) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Server error ${response.status}`);
    return data;
  }
}

function getModel() {
  const provider = localStorage.getItem('nutrisnap_api_provider') || 'anthropic';
  return MODELS[provider] || MODELS.anthropic;
}

function parseJson(raw) {
  const normalized = raw.replace(/'([^']*)'/g, '"$1"');
  for (const candidate of [raw, normalized, raw.match(/\{[\s\S]*\}/)?.[0], normalized.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch {}
  }
  console.error('AI raw response (full):', raw);
  throw new Error(`AI returned unexpected response: ${raw.slice(0, 120)}`);
}

const PHASE1_SUFFIX = 'You must respond with ONLY a raw JSON object — no explanation, no markdown, no extra text whatsoever. Use grams for loose/bulk foods (ref_amount: 100, ref_unit: "g") or a countable unit for discrete items (ref_amount: 1, ref_unit: "egg"/"slice"/"cup"/etc). Example: {"name":"blueberries","amount":30,"unit":"g","ref_amount":100,"ref_unit":"g"}';

// Phase 1: identify food + estimate amount + choose reference unit
export async function identifyFood(base64, mimeType) {
  const data = await callClaude({
    model: getModel(),
    max_tokens: 512,
    _jsonResponse: true,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: `Identify the main food in this image and estimate the quantity shown. ${PHASE1_SUFFIX}` }
      ]
    }]
  });
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  return { ...parseJson(raw), _modelUsed: data._modelUsed };
}

// Phase 1 (text): identify food + estimate amount + choose reference unit
export async function identifyFoodText(description) {
  const data = await callClaude({
    model: getModel(),
    max_tokens: 512,
    _jsonResponse: true,
    messages: [{
      role: 'user',
      content: `Identify the food and quantity from this description: "${description}". ${PHASE1_SUFFIX}`,
    }]
  });
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  return { ...parseJson(raw), _modelUsed: data._modelUsed };
}

// Phase 2: get macros per reference unit (only called for new foods not in library)
export async function getPerUnitMacros(foodName, refAmount, refUnit) {
  const data = await callClaude({
    model: getModel(),
    max_tokens: 512,
    _jsonResponse: true,
    messages: [{
      role: 'user',
      content: `What are the macronutrients for ${refAmount} ${refUnit} of ${foodName}? You must respond with ONLY a raw JSON object — no explanation, no markdown, no extra text whatsoever. Example: {"calories":57,"protein":0.7,"carbs":14.5,"fat":0.3,"fiber":2.4}`,
    }]
  });
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  return { ...parseJson(raw), _modelUsed: data._modelUsed };
}

export async function getNudge(todayTotals, goals) {
  const gaps = {};
  if (goals.calories - todayTotals.calories > 100) gaps.calories = Math.round(goals.calories - todayTotals.calories);
  if (goals.protein - todayTotals.protein > 5) gaps.protein = Math.round((goals.protein - todayTotals.protein) * 10) / 10;
  if (goals.carbs - todayTotals.carbs > 10) gaps.carbs = Math.round((goals.carbs - todayTotals.carbs) * 10) / 10;
  if (goals.fat - todayTotals.fat > 5) gaps.fat = Math.round((goals.fat - todayTotals.fat) * 10) / 10;
  if (Object.keys(gaps).length === 0) return { text: "You've hit all your goals today! Great work.", gaps: {} };

  const hour = new Date().getHours();
  const mealCtx = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 19 ? 'afternoon snack' : 'dinner';
  const prompt = `User nutrition gaps today: ${JSON.stringify(gaps)}. Meal context: ${mealCtx}. Write a single short, friendly, specific nudge (1-2 sentences, max 30 words) suggesting a specific food to eat RIGHT NOW to close the most important gap. Be direct and concrete like: "You need 25g more protein — grab a boiled egg and some chicken breast now!" Return ONLY the nudge text.`;

  const data = await callClaude({
    model: getModel(),
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }]
  });
  return { text: data.content.map(b => b.text || '').join('').trim(), gaps };
}
