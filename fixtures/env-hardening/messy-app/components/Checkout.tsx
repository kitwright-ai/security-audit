"use client";

const { NEXT_PUBLIC_APP_URL } = process.env;

export function Checkout() {
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const secret = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;
  const serverKey = process.env.STRIPE_SECRET_KEY;
  return (
    <a href={`${NEXT_PUBLIC_APP_URL}/checkout`} data-keys={[publishable, secret, serverKey].join()}>
      Pay
    </a>
  );
}
