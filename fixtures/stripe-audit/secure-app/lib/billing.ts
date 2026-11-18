import type Stripe from "stripe";
import { db, processedEvents, subscriptions } from "./db";
import { env } from "./env";
import { stripe } from "./stripe";

async function syncSubscription(tx: typeof db, subscriptionId: string) {
  // Re-fetch: events can arrive out of order.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const organizationId = sub.metadata.organizationId;
  if (!organizationId) return;
  await tx
    .insert(subscriptions)
    .values({ id: sub.id, organizationId, status: sub.status })
    .onConflictDoUpdate({ target: subscriptions.id, set: { status: sub.status } });
}

async function processEvent(tx: typeof db, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        await syncSubscription(tx, session.subscription);
      }
      return;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncSubscription(tx, event.data.object.id);
    case "invoice.payment_failed": {
      const subscription = event.data.object.parent?.subscription_details?.subscription;
      if (typeof subscription === "string") await syncSubscription(tx, subscription);
      return;
    }
    default:
      // Not subscribed to anything else; acknowledge.
      return;
  }
}

/** Route handler body for the Stripe webhook. Pass the untouched Request. */
export async function handleStripeWebhook(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await db.transaction(async (tx: typeof db) => {
      // Claim the event id; a duplicate delivery inserts nothing and is skipped.
      const claimed = await tx
        .insert(processedEvents)
        .values({ id: event.id, type: event.type })
        .onConflictDoNothing()
        .returning();
      if (claimed.length === 0) return;
      await processEvent(tx, event);
    });
    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe webhook]", error);
    // Non-2xx makes Stripe retry; the transaction rolled back.
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
