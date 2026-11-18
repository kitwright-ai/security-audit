"use client";

import { env } from "../env";

export function CheckoutButton() {
  return (
    <a
      href={`${env.NEXT_PUBLIC_APP_URL}/checkout`}
      data-key={env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
    >
      Pay
    </a>
  );
}
