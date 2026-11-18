import { env } from "../../../env";
import { stripe } from "../../../lib/stripe";

export async function POST() {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${env.NEXT_PUBLIC_APP_URL}/thanks`,
  });
  return Response.json({ url: session.url, debug: env.NODE_ENV !== "production" });
}
