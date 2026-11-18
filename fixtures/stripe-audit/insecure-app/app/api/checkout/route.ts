import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

// Subscription checkout: price id straight from the client, nothing linking it to the user.
export async function POST(req: Request) {
  const { priceId, email } = await req.json();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: "https://example.com/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://example.com/pricing",
  });
  return NextResponse.json({ url: session.url });
}
