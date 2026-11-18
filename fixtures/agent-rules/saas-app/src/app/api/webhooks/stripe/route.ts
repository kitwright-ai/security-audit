import { env } from "@/env";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature") ?? "";
  const event = stripe.webhooks.constructEvent(
    await request.text(),
    signature,
    env.STRIPE_WEBHOOK_SECRET,
  );
  return Response.json({ received: event.id });
}
