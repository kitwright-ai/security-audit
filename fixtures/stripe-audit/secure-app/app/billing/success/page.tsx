import { stripe } from "@/lib/stripe";

// Shows status only. Access is granted by the webhook.
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const session = session_id ? await stripe.checkout.sessions.retrieve(session_id) : null;
  return (
    <h1>
      {session?.status === "complete"
        ? "Thanks! Your plan will be active in a few seconds."
        : "Payment not completed."}
    </h1>
  );
}
