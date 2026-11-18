import { z } from "zod";
import { requireOrganization } from "@/lib/auth";
import { PLANS, priceIdFor } from "@/lib/catalog";
import { stripe } from "@/lib/stripe";

const input = z.object({ plan: z.enum(Object.keys(PLANS) as [keyof typeof PLANS]) });

export async function POST(request: Request) {
  const { organizationId, email } = await requireOrganization(request);
  const { plan } = input.parse(await request.json());
  const price = await priceIdFor(plan);
  const metadata = { organizationId };

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      client_reference_id: organizationId,
      customer_email: email,
      line_items: [{ price, quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      success_url: "https://example.com/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://example.com/pricing",
    },
    { idempotencyKey: `checkout:${organizationId}:${plan}:${Date.now()}` },
  );
  return Response.json({ url: session.url });
}
