import { isRouteFile, localImports, routePath } from "./files.mjs";

const WEBHOOK_PATH = /\/(webhooks?|hooks?)(\/|$)/i;

/** Stripe event type literals, e.g. "checkout.session.completed" or a "customer.subscription." prefix. */
export const EVENT_TYPE =
  /["'`]((?:checkout\.session|customer\.subscription|customer|invoice|payment_intent|charge|subscription_schedule|checkout|entitlements)\.[a-z_.]*)["'`]/g;

export const SIGNATURE = /\bconstructEvent(?:Async)?\s*\(/;

/** Code that handles events itself (as opposed to delegating to another module). */
const HANDLES_EVENTS =
  /\bevent\.type\b|\bswitch\s*\(\s*(?:\w+\.)?type\s*\)|["'`](?:checkout\.session|customer\.subscription|invoice|payment_intent|charge)\.[a-z_]+["'`]/;

const STRIPE_HINT =
  /stripe-signature|\bconstructEvent|["'`](?:checkout\.session|customer\.subscription|invoice|payment_intent)\.[a-z_]+["'`]/;

const METHOD_EXPORT =
  /export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(?:GET|POST|PUT|PATCH|DELETE)\s*=|export\s*\{[^}]*\b(?:GET|POST)\b[^}]*\}|export\s+default\b/;

/**
 * @typedef {import("./files.mjs").SourceFile} SourceFile
 * @typedef {{
 *   route: SourceFile; url: string; unit: SourceFile[]; handlers: SourceFile[];
 * }} StripeWebhook
 */

/**
 * Stripe webhook route handlers. Each one comes with its "unit": the route file plus the local
 * modules it imports directly, and the subset of those files that actually handle events.
 * @param {SourceFile[]} files
 * @returns {StripeWebhook[]}
 */
export function findStripeWebhooks(files) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const webhooks = [];
  for (const route of files) {
    if (!isRouteFile(route.path) || !METHOD_EXPORT.test(route.content)) continue;
    const url = routePath(route.path);
    const unit = [route, ...localImports(route, byPath)];
    const looksLikeWebhook =
      WEBHOOK_PATH.test(url) || STRIPE_HINT.test(route.content) || /webhook/i.test(route.content);
    if (!looksLikeWebhook) continue;
    const isStripe =
      unit.some((f) => STRIPE_HINT.test(f.content)) ||
      (WEBHOOK_PATH.test(url) && /stripe/i.test(url));
    if (!isStripe) continue;
    const handlers = unit.filter(
      (f) => HANDLES_EVENTS.test(f.content) || SIGNATURE.test(f.content),
    );
    webhooks.push({ route, url, unit, handlers });
  }
  return webhooks;
}

/** Index of the first exported handler, for reporting. */
export function firstHandlerIndex(file) {
  const m = METHOD_EXPORT.exec(file.content);
  return m?.index ?? 0;
}

/** Event types a set of files mentions as string literals. */
export function handledEvents(files) {
  const events = new Set();
  for (const f of files) {
    for (const m of f.content.matchAll(EVENT_TYPE)) events.add(m[1]);
  }
  return events;
}

/** True if `event` is in `handled`, directly or through a prefix such as "customer.subscription.". */
export function handles(handled, event) {
  if (handled.has(event)) return true;
  for (const h of handled) if (h.endsWith(".") && event.startsWith(h)) return true;
  return false;
}
