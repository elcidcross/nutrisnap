module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid JSON' });

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) return res.status(500).json({ error: 'Server misconfigured: APP_PASSWORD not set' });
  if (!body._password || body._password !== appPassword) return res.status(401).json({ error: 'Unauthorized' });

  if (body._authOnly) return res.status(200).json({ ok: true });

  const provider = body._provider || 'anthropic';
  const apiKey = body._userApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'No API key configured. Add one in Settings.' });

  const { _password, _userApiKey, _provider, _jsonResponse, ...aiBody } = body;

  try {
    let result;
    if (provider === 'openai') result = await callOpenAI(apiKey, aiBody);
    else if (provider === 'gemini') result = await callGemini(apiKey, aiBody, _jsonResponse);
    else result = await callAnthropic(apiKey, aiBody);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

async function callAnthropic(apiKey, body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error?.message || 'Anthropic error'), { status: r.status === 401 ? 502 : r.status });
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

async function callOpenAI(apiKey, body) {
  const messages = body.messages.map(m => ({ role: m.role, content: toOpenAIContent(m.content) }));
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: body.model, max_tokens: body.max_tokens, messages }),
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error?.message || 'OpenAI error'), { status: r.status });
  return { content: [{ type: 'text', text: data.choices[0].message.content }] };
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
  const parts = body.messages.flatMap(m => toGeminiParts(m.content));
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: body.max_tokens, ...(jsonResponse && { responseMimeType: 'application/json' }) },
      }),
    }
  );
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error?.message || 'Gemini error'), { status: r.status });
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  return { content: [{ type: 'text', text: responseParts.map(p => p.text || '').join('') }] };
}

async function callGemini(apiKey, body, jsonResponse) {
  const fallback = body.model === 'gemini-3.5-flash' ? 'gemini-2.5-flash' : null;
  try {
    return await callGeminiModel(apiKey, body.model, body, jsonResponse);
  } catch (err) {
    if (err.status === 503 && fallback) return callGeminiModel(apiKey, fallback, body, jsonResponse);
    throw err;
  }
}
