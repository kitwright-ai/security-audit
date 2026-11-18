import { blockFrom, isPagesApiRoute, lineAt } from "../files.mjs";
import { isSuppressed, snippet } from "../findings.mjs";
import { firstHandlerIndex, handledEvents, handles, SIGNATURE } from "../routes.mjs";

/** Writes that are not naturally idempotent: inserts, creates, increments, emails. */
const SIDE_EFFECT =
  /(?<!Object|Response)\.(?:insert|create|createMany|insertMany|increment|incr|incrBy)\s*\(|\bincrement\s*:|\.emails\.send\s*\(|\bsend(?:\w*Email|\w*Mail)\s*\(|\b(?:credits|balance)\s*:\s*[^,\n]*\+|\bsql`[^`]*[-+]\s*\$\{/;

/** Signs that the handler records `event.id` (or similar) to skip duplicate deliveries. */
const DEDUPE =
  /\b(?:event|evt|stripeEvent)\.id\b|\beventId\b|\bevent_id\b|processed_?events|processedEvents|webhook_?events\b|webhookEvents|stripe_?events\b|stripeEvents|billing_?webhook_?event|billingWebhookEvent|idempoten/i;

const RESPONSE =
  /\breturn\b[^;]*\b(?:Response|NextResponse|res\.(?:json|send|status|end))\b|\bres\.(?:json|send|end)\s*\(|\bres\.status\(\s*2\d\d\s*\)/;
const ERROR_STATUS =
  /\bstatus\s*:\s*[45]\d\d\b|\bstatus\(\s*[45]\d\d\s*\)|\bstatusCode\s*=\s*[45]\d\d/;

const withoutLogs = (content) =>
  content
    .split("\n")
    .filter((l) => !/console\.\w+\(/.test(l))
    .join("\n");

/** First argument of the call whose `(` is at `openIndex`. */
function firstArgument(content, openIndex) {
  const call = blockFrom(content, openIndex).slice(1, -1);
  let depth = 0;
  for (let i = 0; i < call.length; i++) {
    const ch = call[i];
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) return call.slice(0, i).trim();
  }
  return call.trim();
}

/** The expression a bare identifier was assigned from, if declared in the same file. */
function resolveIdentifier(content, expression) {
  if (!/^[A-Za-z_$][\w$]*$/.test(expression)) return expression;
  const decl = new RegExp(`(?:const|let|var)\\s+${expression}\\s*(?::[^=]+)?=\\s*([^;\\n]+)`).exec(
    content,
  );
  return decl ? `${expression} = ${decl[1]}` : expression;
}

/**
 * @param {{
 *   files: import("../files.mjs").SourceFile[];
 *   webhooks: import("../routes.mjs").StripeWebhook[];
 *   usesSubscriptions: boolean;
 *   stripeSites: { subscription?: { file: import("../files.mjs").SourceFile; index: number };
 *                  checkout?: { file: import("../files.mjs").SourceFile; index: number } };
 * }} ctx
 */
export function checkWebhooks(ctx) {
  const findings = [];
  const seen = new Set();
  const add = (file, index, finding) => {
    const line = lineAt(file.content, index);
    const key = `${finding.check}:${file.path}:${line}`;
    if (seen.has(key) || isSuppressed(file, line, finding.check)) return;
    seen.add(key);
    findings.push({
      category: "webhooks",
      file: file.path,
      line,
      snippet: snippet(file, line),
      ...finding,
    });
  };

  for (const webhook of ctx.webhooks) {
    const { route, url, unit, handlers } = webhook;
    const verified = unit.some((f) => SIGNATURE.test(f.content));

    // 1. No signature verification at all.
    if (!verified && handlers.length > 0) {
      add(route, firstHandlerIndex(route), {
        check: "webhook-no-signature",
        severity: "high",
        title: `Stripe webhook \`${url}\` never verifies the signature`,
        why: 'Anyone can POST a fake `checkout.session.completed` or "invoice paid" event to this URL and get access without paying. The handler cannot tell Stripe from an attacker.',
        fix: 'Read the raw body and verify it before doing anything: `const event = await stripe.webhooks.constructEventAsync(await request.text(), request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET)`; return 400 when it throws.',
      });
    }

    // 2. Signature verified over a parsed / re-serialized body.
    for (const file of unit) {
      for (const call of file.content.matchAll(new RegExp(SIGNATURE.source, "g"))) {
        const open = call.index + call[0].lastIndexOf("(");
        const arg = resolveIdentifier(file.content, firstArgument(file.content, open));
        const parsed =
          /JSON\.stringify|\.json\(\s*\)/.test(arg) ||
          (!isPagesApiRoute(route.path) && /\b(?:req|request)\.body\b/.test(arg));
        const pagesWithoutRaw =
          isPagesApiRoute(route.path) &&
          file === route &&
          !/bodyParser\s*:\s*false/.test(route.content);
        if (!parsed && !pagesWithoutRaw) continue;
        add(file, call.index, {
          check: "webhook-parsed-body",
          severity: "medium",
          title: pagesWithoutRaw
            ? `Stripe webhook \`${url}\` verifies a body Next.js already parsed`
            : `Stripe webhook \`${url}\` verifies a parsed body instead of the raw body`,
          why: 'Stripe signs the exact raw bytes. A parsed and re-serialized body (`JSON.stringify(await req.json())`, or `req.body` with the Pages Router body parser on) does not match, so verification fails for every real event — paid customers never get access — or someone "fixes" it by removing verification.',
          fix: pagesWithoutRaw
            ? "Add `export const config = { api: { bodyParser: false } }` and pass the raw buffer (e.g. `await buffer(req)` from `micro`, or read the stream) to `constructEvent`."
            : "Read the body once with `const body = await request.text()`, pass that string to `constructEventAsync`, and use the returned event instead of parsing the body yourself.",
        });
      }
    }

    // 3. Side effects without deduplication by event.id.
    const dedupes = handlers.some((f) => DEDUPE.test(withoutLogs(f.content)));
    if (!dedupes) {
      for (const file of handlers) {
        const effect = SIDE_EFFECT.exec(withoutLogs(file.content));
        if (!effect) continue;
        const index = file.content.indexOf(effect[0]);
        add(file, index === -1 ? 0 : index, {
          check: "webhook-not-idempotent",
          severity: "medium",
          title: `Stripe webhook \`${url}\` has side effects but no deduplication by \`event.id\``,
          why: "Stripe delivers events at least once and retries on timeouts, so the same event can arrive twice (or concurrently). Without dedup you grant credits twice, send duplicate emails or create duplicate orders.",
          fix: "Store processed event ids in a table with a unique key and claim the id in the same transaction as the side effects: `insert into processed_events (id) values (event.id) on conflict do nothing` — if nothing was inserted, return 200 without doing anything.",
        });
        break;
      }
    }

    // 4. Errors acknowledged with 200, or unhandled event types rejected.
    for (const file of handlers) {
      for (const m of file.content.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)) {
        const block = blockFrom(file.content, m.index + m[0].length - 1);
        if (!RESPONSE.test(block) || ERROR_STATUS.test(block) || /\bthrow\b/.test(block)) continue;
        add(file, m.index, {
          check: "webhook-error-swallowed",
          severity: "medium",
          title: `Stripe webhook \`${url}\` answers 200 when processing fails`,
          why: "A 2xx response tells Stripe the event was handled, so it is never retried. A transient database error means a paying customer silently never gets access (or a cancellation is never applied).",
          fix: "Return a 5xx (or rethrow) when processing fails so Stripe retries; keep 400 for invalid signatures and 200 only after the work is committed.",
        });
      }

      for (const m of file.content.matchAll(/\bswitch\s*\(\s*(?:\w+\.)?type\s*\)\s*\{/g)) {
        const open = m.index + m[0].length - 1;
        const block = blockFrom(file.content, open);
        const def = block.search(/\bdefault\s*:/);
        if (def === -1) continue;
        const rest = block.slice(def);
        if (!ERROR_STATUS.test(rest) && !/\bthrow\b/.test(rest)) continue;
        add(file, open + def, {
          check: "webhook-unhandled-event-error",
          severity: "low",
          title: `Stripe webhook \`${url}\` returns an error for event types it doesn't handle`,
          why: "Stripe retries non-2xx responses for up to 3 days and may disable the endpoint. Events you don't care about (or new ones enabled later in the Dashboard) end up failing forever and hide real errors.",
          fix: "Acknowledge unhandled event types with 200 (optionally log them), and subscribe the endpoint only to the events you handle.",
        });
      }
    }
  }

  // 5. Subscriptions without the events that revoke access.
  const handled = handledEvents(ctx.webhooks.flatMap((w) => w.handlers));
  const active = ctx.webhooks.filter((w) => w.handlers.length > 0);
  // Report on the webhook that fulfils checkouts, if there is one.
  const withHandlers =
    active.find((w) => handledEvents(w.handlers).has("checkout.session.completed")) ?? active[0];
  if (ctx.usesSubscriptions && withHandlers && handled.size > 0) {
    const deleted = handles(handled, "customer.subscription.deleted");
    const updated = handles(handled, "customer.subscription.updated");
    const failed = handles(handled, "invoice.payment_failed");
    const missing = [
      !deleted && "customer.subscription.deleted",
      !updated && "customer.subscription.updated",
      !updated && !failed && "invoice.payment_failed",
    ].filter(Boolean);
    if (missing.length > 0) {
      const { route, url } = withHandlers;
      add(route, firstHandlerIndex(route), {
        check: "webhook-missing-events",
        severity: !deleted || (!updated && !failed) ? "high" : "medium",
        title: `${active.length > 1 ? "No Stripe webhook handles" : `Stripe webhook \`${url}\` doesn't handle`} ${missing.map((e) => `\`${e}\``).join(", ")}`,
        why: "The app sells subscriptions, but access is only ever granted: when a customer cancels, a renewal payment fails or the plan changes, the database never hears about it and the user keeps paid access for free.",
        fix: "Handle `customer.subscription.updated` and `customer.subscription.deleted` (and `invoice.payment_failed` if you act on dunning), re-fetch the subscription from Stripe and store its `status`; check `status in (active, trialing)` when granting access. Enable the same events on the endpoint in the Dashboard.",
      });
    }
  }

  // 6. Checkout or subscriptions in use, but no webhook at all.
  const site = ctx.stripeSites.subscription ?? ctx.stripeSites.checkout;
  if (ctx.webhooks.length === 0 && site) {
    add(site.file, site.index, {
      check: "webhook-not-found",
      severity: "medium",
      title: "Stripe Checkout is used but no Stripe webhook route was found",
      why: "Without a webhook the app learns about payments only from the success redirect, which users can skip or forge, and never learns about cancellations, failed renewals, refunds or disputes.",
      fix: "Add a route handler (e.g. `app/api/webhooks/stripe/route.ts`) that verifies the signature and syncs payments and subscriptions into the database. If the webhook lives in another service, ignore this finding.",
    });
  }

  return findings;
}
