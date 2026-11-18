"use client";

import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

export function CheckoutButton({ plan }: { plan: "pro_monthly" | "pro_yearly" }) {
  async function checkout() {
    await stripePromise;
    const res = await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ plan }) });
    const { url } = await res.json();
    window.location.assign(url);
  }
  return (
    <button type="button" onClick={checkout}>
      Subscribe
    </button>
  );
}
