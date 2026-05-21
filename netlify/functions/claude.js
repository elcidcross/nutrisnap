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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Server misconfigured: Supabase env vars not set' }) };
  }

  const token = body._supabaseToken;
  if (!token) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseAnonKey },
  }).catch(() => null);
  if (!authRes || !authRes.ok) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const provider = body._provider || 'anthropic';
  const apiKey = body._userApiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No API key configured. Add one in Settings.' }) };
  }

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

function extractPrefill(body) {
  const last = body.messages?.[body.messages.length - 1];
  if (last?.role === 'assistant' && typeof last.content === 'string') {
    return { prefill: last.content, body: { ...body, messages: body.messages.slice(0, -1) } };
  }
  return { prefill: '', body };
}

async function callAnthropic(apiKey, body, jsonResponse) {
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
    if (block.type === 'image') return {
      type: 'image_url',
      image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
    };
    return block;
  });
}

async function callOpenAI(apiKey, body, jsonResponse) {
  const { prefill, body: stripped } = extractPrefill(body);
  const messages = stripped.messages.map(m => ({ role: m.role, content: toOpenAIContent(m.content) }));
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: stripped.model,
      max_tokens: stripped.max_tokens,
      messages,
      ...(jsonResponse && { response_format: { type: 'json_object' } }),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || 'OpenAI error'), { status: res.status });
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
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: stripped.max_tokens, ...(jsonResponse && { responseMimeType: 'application/json' }) },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || 'Gemini error'), { status: res.status });
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  const text = responseParts.map(p => p.text || '').join('');
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
