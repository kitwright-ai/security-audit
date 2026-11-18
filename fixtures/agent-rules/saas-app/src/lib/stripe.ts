import Stripe from "stripe";

// Reads process.env directly instead of going through src/env.ts.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
