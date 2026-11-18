import { stripe } from "./stripe";

/** Plans the client may choose from. Prices live in Stripe under these lookup keys. */
export const PLANS = {
  pro_monthly: { lookupKey: "kitwright:pro_monthly" },
  pro_yearly: { lookupKey: "kitwright:pro_yearly" },
} as const;

export type Plan = keyof typeof PLANS;

export async function priceIdFor(plan: Plan): Promise<string> {
  const { data } = await stripe.prices.list({
    lookup_keys: [PLANS[plan].lookupKey],
    active: true,
    limit: 1,
  });
  const price = data[0];
  if (!price) throw new Error(`No active price for ${plan}`);
  return price.id;
}
