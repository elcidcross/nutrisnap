export default async (req) => {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || token !== process.env.DEMO_PASSWORD) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return Response.json(data);
};

export const config = { path: '/api/claude' };
