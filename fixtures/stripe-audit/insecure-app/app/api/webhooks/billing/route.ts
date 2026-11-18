import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature") ?? "";
  const body = await req.json();
  const event = stripe.webhooks.constructEvent(
    JSON.stringify(body),
    signature,
    "whsec_FAKEFAKEFAKEFAKE0000",
  );

  switch (event.type) {
    case "invoice.paid":
      break;
    default:
      return NextResponse.json({ error: `Unhandled event ${event.type}` }, { status: 400 });
  }
  return NextResponse.json({ received: true });
}
