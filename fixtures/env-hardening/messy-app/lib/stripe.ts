import Stripe from "stripe";

// biome-ignore lint/complexity/useLiteralKeys: the scanner must detect the bracket form.
export const stripe = new Stripe(process.env["STRIPE_SECRET_KEY"] as string);
export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_dev_only";
