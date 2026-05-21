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

export async function analyzeFood(base64, mimeType) {
  const data = await callClaude({
    model: getModel(),
    max_tokens: 2048,
    _jsonResponse: true,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: 'Analyze this food image. You must respond with ONLY a raw JSON object — no explanation, no markdown, no extra text whatsoever. Format: {"name":"short name max 5 words","calories":integer,"protein":decimal,"carbs":decimal,"fat":decimal,"fiber":decimal}. Estimate for a typical single serving.' }
      ]
    }]
  });
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  const normalized = raw.replace(/'([^']*)'/g, '"$1"');
  for (const candidate of [raw, normalized, raw.match(/\{[\s\S]*\}/)?.[0], normalized.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try { return { ...JSON.parse(candidate), _modelUsed: data._modelUsed }; } catch {}
  }
  throw new Error(`AI returned unexpected response: ${raw.slice(0, 120)}`);
}

export async function analyzeFoodText(description) {
  const data = await callClaude({
    model: getModel(),
    max_tokens: 2048,
    _jsonResponse: true,
    messages: [{
      role: 'user',
      content: `Analyze this meal description and estimate its nutrition. You must respond with ONLY a raw JSON object — no explanation, no markdown, no extra text whatsoever. Format: {"name":"short name max 5 words","calories":integer,"protein":decimal,"carbs":decimal,"fat":decimal,"fiber":decimal}. Meal: ${description}`
    }]
  });
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  const normalized = raw.replace(/'([^']*)'/g, '"$1"');
  for (const candidate of [raw, normalized, raw.match(/\{[\s\S]*\}/)?.[0], normalized.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try { return { ...JSON.parse(candidate), _modelUsed: data._modelUsed }; } catch {}
  }
  throw new Error(`AI returned unexpected response: ${raw.slice(0, 120)}`);
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
