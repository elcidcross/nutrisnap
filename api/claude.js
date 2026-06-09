module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid JSON' });

  // Validate Supabase JWT
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return res.status(500).json({ error: 'Server misconfigured: Supabase env vars not set' });

  const token = body._supabaseToken;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseAnonKey },
  }).catch(() => null);
  if (!authRes || !authRes.ok) return res.status(401).json({ error: 'Unauthorized' });
  let userId = null;
  try { userId = (await authRes.json())?.id || null; } catch (_) {}

  const provider = body._provider || 'anthropic';
  const apiKey = body._userApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'No API key configured. Add one in Settings.' });

  const { _supabaseToken, _userApiKey, _provider, _jsonResponse, ...aiBody } = body;

  try {
    let result;
    if (provider === 'openai') result = await callOpenAI(apiKey, aiBody, _jsonResponse);
    else if (provider === 'gemini') result = await callGemini(apiKey, aiBody, _jsonResponse);
    else result = await callAnthropic(apiKey, aiBody, _jsonResponse);
    const _modelUsed = result._modelUsed || aiBody.model;
    const { _modelUsed: _, ...clean } = result;
    if (_jsonResponse) {
      const txt = clean.content?.map(b => b.text || '').join('') || '';
      console.log(`[${provider}] JSON response (len=${txt.length}):`, txt.slice(0, 500));
    }
    return res.status(200).json({ ...clean, _modelUsed });
  } catch (err) {
    const status = err.status || 500;
    // Durably record the failure so it survives Vercel's short log retention.
    await logError(supabaseUrl, supabaseAnonKey, token, userId, {
      provider,
      model: aiBody.model || null,
      status,
      message: err.message || 'Unknown error',
      context: { jsonResponse: !!_jsonResponse },
    });
    return res.status(status).json({ error: err.message });
  }
};

// Fire an insert into the error_log table using the caller's already-validated
// JWT, so the existing auth.uid() = user_id RLS policy applies (no service-role
// key needed). Awaited (not fire-and-forget) so the write completes before the
// serverless function freezes; failures here are swallowed and never surfaced.
async function logError(supabaseUrl, anonKey, token, userId, entry) {
  if (!userId) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/error_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ user_id: userId, ...entry }),
    });
  } catch (e) {
    console.error('error_log insert failed:', e.message);
  }
}

// Detect assistant prefill (Anthropic style: last message is { role: 'assistant' })
// and strip it so OpenAI/Gemini don't choke, then re-prepend its content to the response.
function extractPrefill(body) {
  const last = body.messages?.[body.messages.length - 1];
  if (last?.role === 'assistant' && typeof last.content === 'string') {
    return { prefill: last.content, body: { ...body, messages: body.messages.slice(0, -1) } };
  }
  return { prefill: '', body };
}

async function callAnthropic(apiKey, body, jsonResponse) {
  // Anthropic supports assistant prefill natively — pass the body through.
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error?.message || 'Anthropic error'), { status: r.status === 401 ? 502 : r.status });
  // Prepend prefill to response text so caller sees complete JSON object
  const last = body.messages?.[body.messages.length - 1];
  const prefill = (last?.role === 'assistant' && typeof last.content === 'string') ? last.content : '';
  if (prefill && data.content?.[0]?.type === 'text') {
    data.content[0].text = prefill + (data.content[0].text || '');
  }
  return data;
}

function toOpenAIContent(content) {
  if (typeof content === 'string') return content;
  return content.map(block => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'image') return { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } };
    return block;
  });
}

async function callOpenAI(apiKey, body, jsonResponse) {
  const { prefill, body: stripped } = extractPrefill(body);
  const messages = stripped.messages.map(m => ({ role: m.role, content: toOpenAIContent(m.content) }));
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: stripped.model,
      max_tokens: stripped.max_tokens,
      messages,
      ...(jsonResponse && { response_format: { type: 'json_object' } }),
    }),
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error?.message || 'OpenAI error'), { status: r.status });
  return { content: [{ type: 'text', text: prefill + data.choices[0].message.content }] };
}

function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  return content.map(block => {
    if (block.type === 'text') return { text: block.text };
    if (block.type === 'image') return { inline_data: { mime_type: block.source.media_type, data: block.source.data } };
    return { text: '' };
  });
}

async function callGeminiModel(apiKey, model, body, jsonResponse) {
  const { prefill, body: stripped } = extractPrefill(body);
  const parts = stripped.messages.flatMap(m => toGeminiParts(m.content));
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        // Gemini 2.5/3.x Flash are thinking models: hidden reasoning tokens count
        // against maxOutputTokens. Left enabled, thinking eats the budget and the
        // JSON gets truncated mid-response (e.g. cut off inside the components
        // array → a meal saved with all-zero macros). These are structured
        // extraction calls that don't need it, so disable thinking outright.
        generationConfig: {
          maxOutputTokens: stripped.max_tokens,
          thinkingConfig: { thinkingBudget: 0 },
          ...(jsonResponse && { responseMimeType: 'application/json' }),
        },
      }),
    }
  );
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error?.message || 'Gemini error'), { status: r.status });
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  const text = responseParts.map(p => p.text || '').join('');
  // Gemini in JSON mode already returns clean JSON, don't double-prepend prefill if it's already there
  const finalText = (jsonResponse && text.trimStart().startsWith('{')) ? text : prefill + text;
  return { content: [{ type: 'text', text: finalText }] };
}

async function callGemini(apiKey, body, jsonResponse) {
  const fallback = body.model === 'gemini-3.5-flash' ? 'gemini-2.5-flash' : null;
  try {
    const result = await callGeminiModel(apiKey, body.model, body, jsonResponse);
    return { ...result, _modelUsed: body.model };
  } catch (err) {
    if (err.status === 503 && fallback) {
      const result = await callGeminiModel(apiKey, fallback, body, jsonResponse);
      return { ...result, _modelUsed: fallback };
    }
    throw err;
  }
}
