exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // ── Password check ──────────────────────────────────────────────────────────
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return { statusCode: 500, body: 'Server misconfigured: APP_PASSWORD not set' };
  }
  if (!body._password || body._password !== appPassword) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (body._authOnly) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  }

  const provider = body._provider || 'anthropic';
  const apiKey = body._userApiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No API key configured. Add one in Settings.' }) };
  }

  const { _password, _userApiKey, _provider, _jsonResponse, ...aiBody } = body;

  try {
    let result;
    if (provider === 'openai') result = await callOpenAI(apiKey, aiBody);
    else if (provider === 'gemini') result = await callGemini(apiKey, aiBody, _jsonResponse);
    else result = await callAnthropic(apiKey, aiBody);

    const _modelUsed = result._modelUsed || aiBody.model;
    const { _modelUsed: _, ...clean } = result;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ...clean, _modelUsed }),
    };
  } catch (err) {
    return {
      statusCode: err.status || 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

async function callAnthropic(apiKey, body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const status = res.status === 401 ? 502 : res.status;
    throw Object.assign(new Error(data.error?.message || 'Anthropic error'), { status });
  }
  return data;
}

// Convert Anthropic content blocks → OpenAI content array
function toOpenAIContent(content) {
  if (typeof content === 'string') return content;
  return content.map(block => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'image') return {
      type: 'image_url',
      image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
    };
    return block;
  });
}

async function callOpenAI(apiKey, body) {
  const messages = body.messages.map(m => ({ role: m.role, content: toOpenAIContent(m.content) }));
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: body.model, max_tokens: body.max_tokens, messages }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || 'OpenAI error'), { status: res.status });
  // Normalize to Anthropic response shape
  return { content: [{ type: 'text', text: data.choices[0].message.content }] };
}

// Convert Anthropic content blocks → Gemini parts array
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
  const res = await fetch(
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
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || 'Gemini error'), { status: res.status });
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  return { content: [{ type: 'text', text: responseParts.map(p => p.text || '').join('') }] };
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
