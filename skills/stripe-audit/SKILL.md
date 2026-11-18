---
name: stripe-audit
description: Audit the Stripe integration of a Next.js app (App Router or Pages Router) for the mistakes that lose money or give away paid access — webhooks without signature verification or verified over a parsed body, handlers that are not idempotent by event.id, subscriptions that are never revoked on cancel or failed payment, access granted from the success page, prices or amounts sent by the client, checkout sessions not linked to a user, and leaked secret or webhook keys. Use when the user says "check my Stripe integration", "review my Stripe webhooks", "subscriptions not updating", "users getting access without paying", "payments not showing up", or before going live with Stripe.
---

# Stripe audit

Produce a verified report on the project's Stripe integration (current directory, or the path
the user gives) and offer fixes. The bundled script finds candidates; **you** confirm each one
by tracing the payment flow in the code, because static checks have false positives and blind
spots — and the most expensive bugs are in the flow, not in a single line.

## 1. Run the scanner

```bash
node <this-skill-dir>/scripts/audit.mjs <project-path> --out stripe-audit-report.md
```

- Requires Node 18+, no dependencies, read-only (it only writes the `--out` file). Add `--json`
  for machine-readable output.
- It covers: webhook signature verification and raw body, deduplication by `event.id`,
  subscription events that revoke access, error status codes returned to Stripe, middleware
  blocking the webhook, fulfilment on the success page, client-controlled prices/amounts,
  sessions without `client_reference_id`/`metadata`, hard-coded or browser-exposed keys, live
  keys in dev env files and an unpinned `apiVersion`.
- Secrets are masked in the report (`sk_live_…`). Never print full key values yourself either.

## 2. Trace the payment flow end to end

Before judging findings, map the flow and write it down in a few lines:

1. **Checkout creation** — where `checkout.sessions.create` (or `paymentIntents.create`) is
   called, who can call it (auth?), where the price/amount comes from, and how the session is
   linked to the user/organization (`client_reference_id`, `metadata`, `customer`).
2. **Redirect** — what the `success_url` page does. It must only display status.
3. **Webhook** — signature verified on the raw body, which events are handled, how duplicates
   are skipped, what status is returned on success, on bad signatures and on failure.
4. **Database** — what is stored (payment status, subscription `status`, period end, plan) and
   whether it is re-fetched from Stripe or trusted from the event payload.
5. **Access checks** — where the app decides "this user has paid" (feature gates, middleware,
   server actions) and whether that reads the synced state (`active`/`trialing`), not a flag
   set once at checkout.

## 3. Verify every finding

For each finding, open the file and decide:

- **Confirmed** — describe the concrete consequence in one sentence ("anyone can POST a fake
  `checkout.session.completed` and get Pro for free"; "a cancelled customer keeps access
  forever").
- **False positive** — explain why (e.g. dedup happens in a helper the scanner didn't follow,
  the middleware matcher excludes the path). Suggest a `// stripe-audit-ignore <check> <reason>`
  comment so the next run is clean, but don't add it without the user's consent.

Then check what static analysis can't see:

- **Test vs live:** which keys each environment uses (ask; don't read production secrets). Live
  keys only in production; test keys and the `stripe listen` secret locally.
- **Dashboard webhook endpoint:** registered for exactly the events the code handles
  (`checkout.session.completed`, `customer.subscription.updated`/`deleted`,
  `invoice.payment_failed`/`invoice.paid`, `charge.refunded`, `charge.dispute.created` as
  relevant), pointing at the right URL, in the right mode, with its signing secret in the env.
- **Async payment methods:** `checkout.session.async_payment_succeeded`/`failed` handled when
  bank debits or similar are enabled; `payment_status === "paid"` checked before fulfilling.
- **Subscription state:** `cancel_at_period_end`, `past_due`/`unpaid`, trials, plan changes and
  quantity changes reflected in access; out-of-order events handled (re-fetch the subscription).
- **Customer Portal:** configured (cancellation, plan switching, allowed products) and its
  changes arrive through the same webhook.
- **Refunds and disputes:** access or credits revoked on `charge.refunded` /
  `charge.dispute.created` if the business requires it.
- **Tax and currencies:** Stripe Tax / `automatic_tax` if the business must collect tax;
  amounts in minor units.
- **Idempotency keys** on server-side calls that create charges, customers or subscriptions
  (`{ idempotencyKey }`), so retries and double clicks don't charge twice.
- **Retries and timeouts:** the webhook returns 2xx only after work is committed and
  answers fast (heavy work queued), 5xx on failure so Stripe retries.
- **One customer per user/org:** no duplicate Stripe customers on repeated checkouts.

## 4. Offer to test with the Stripe CLI (test mode only)

Suggest commands for the user to run — don't run anything yourself against live mode, and never
with a live key:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # prints a test whsec_ secret
stripe trigger checkout.session.completed
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
stripe events resend <evt_id>     # same event twice: must not double-grant
```

Also suggest sending an unsigned request (`curl -X POST .../api/webhooks/stripe -d '{}'`) —
it must return 400.

## 5. Report

Rewrite `stripe-audit-report.md` with only verified issues, ordered by severity, each with:
location, what can go wrong (money lost, free access, broken fulfilment) and the fix (code).
Include the payment-flow map from step 2, a "Dashboard and configuration checklist" for the
items you couldn't verify from code, and a short "Checked and OK" section. Lead with a 3–5 line
plain-language summary for non-technical readers.

## 6. Fix (only with consent)

Offer to fix the confirmed issues, highest severity first. When fixing:

- Never print, log or commit key values. If a secret or webhook key was committed or exposed,
  tell the user to **roll it in the Dashboard** — removing it from the code is not enough.
- Webhook pattern: `await request.text()` → `constructEventAsync` (400 on failure) → claim
  `event.id` in a unique processed-events table in the same transaction as the effects → re-fetch
  subscriptions from Stripe → 200; 500 when processing fails.
- Prices from a server-side catalog (plan key → price id / `lookup_key`), never amounts from the
  request; always `client_reference_id` + `metadata` with the user/organization id.
- Re-run the scanner after fixing and show the before/after counts.

## Exit codes (CI)

`--fail-on high|medium|low` exits with 1 when any finding at or above that severity remains
(2 on bad arguments).
