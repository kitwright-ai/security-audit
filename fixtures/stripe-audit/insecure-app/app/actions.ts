"use server";

import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";

// One-time payment: the amount comes from the form.
export async function buyCredits(formData: FormData) {
  const amount = Number(formData.get("amount"));
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: String(formData.get("userId")),
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amount * 100,
          product_data: { name: "Credits" },
        },
        quantity: 1,
      },
    ],
    success_url: "https://example.com/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://example.com/pricing",
  });
  redirect(session.url ?? "/");
}
