import { stripe } from "@/lib/stripe";

export default async function Dashboard() {
  const invoices = await stripe.invoices.list({ limit: 10 });
  console.log(invoices);
  return <pre>{JSON.stringify(invoices.data, null, 2)}</pre>;
}
