"use client";

import Stripe from "stripe";

// Server SDK and secret key in the browser.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2025-10-29.clover" });

export function Pricing() {
  return (
    <button type="button" onClick={() => stripe.checkout.sessions.list()}>
      Buy
    </button>
  );
}
