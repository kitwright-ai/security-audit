// Public by nature, but no rate limiting: open to credential stuffing.
export async function POST(request: Request) {
  const { email, password } = await request.json();
  return Response.json({ ok: Boolean(email && password) });
}
