const MODEL = 'claude-sonnet-4-20250514';

export async function analyzeFood(base64, mimeType) {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: 'Analyze this food image. Return ONLY valid JSON (no markdown): {"name":"short name max 5 words","calories":integer,"protein":decimal,"carbs":decimal,"fat":decimal,"fiber":decimal}. Estimate for a typical single serving.' }
        ]
      }]
    })
  });
  const data = await response.json();
  const text = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
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

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await response.json();
  return { text: data.content.map(b => b.text || '').join('').trim(), gaps };
}
