// Trusts the payload without verifying the Stripe signature.
export async function POST(request: Request) {
  const event = await request.json();
  if (event.type === "checkout.session.completed") {
    // mark order as paid...
  }
  return Response.json({ received: true });
}
