/**
 * Netlify Serverless Function: /api/claude
 *
 * Standard Node.js runtime — uses process.env, not Deno.
 * Set these in Netlify dashboard → Site → Environment variables:
 *   ANTHROPIC_API_KEY  =  sk-ant-...
 *   APP_PASSWORD       =  your chosen password
 */

exports.handler = async (event) => {
  // Only allow POST
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
  const providedPassword = body._password;

  if (!appPassword) {
    return { statusCode: 500, body: 'Server misconfigured: APP_PASSWORD not set in environment variables' };
  }
  if (!providedPassword || providedPassword !== appPassword) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  // Auth-only check: just validate the password, don't call Anthropic
  if (body._authOnly) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  }

  // Strip the password field before forwarding to Anthropic
  const { _password, ...anthropicBody } = body;

  // ── Forward to Anthropic ────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: 'Server misconfigured: ANTHROPIC_API_KEY not set in environment variables' };
  }

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicBody),
  });

  const data = await anthropicResponse.json();

  // Remap Anthropic's 401 (bad API key) to 502 so the client doesn't
  // mistake it for the app's own password-check 401.
  const statusCode = anthropicResponse.status === 401 ? 502 : anthropicResponse.status;

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(data),
  };
};
