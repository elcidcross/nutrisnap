export default async (req) => {
  const { password } = await req.json();
  if (password && password === process.env.DEMO_PASSWORD) {
    return new Response('ok', { status: 200 });
  }
  return new Response('Unauthorized', { status: 401 });
};

export const config = { path: '/api/auth' };
