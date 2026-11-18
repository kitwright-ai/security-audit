import { stripe } from "@/lib/stripe";

// Verifies a re-serialized body instead of the raw bytes.
export async function POST(request: Request) {
  const body = JSON.stringify(await request.json());
  const event = stripe.webhooks.constructEvent(
    body,
    request.headers.get("stripe-signature") ?? "",
    "x",
  );
  return Response.json({ type: event.type });
}
