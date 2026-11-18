# Stripe audit report

- **Project:** insecure-app
- **Generated:** 2026-11-18T13:03:36.563Z
- **Files scanned:** 12 (Next.js)
- **Stripe:** detected · webhook `/api/webhooks/billing`, `/api/webhooks/stripe` · subscriptions

| Severity | Findings |
| --- | --- |
| 🔴 HIGH | 9 |
| 🟠 MEDIUM | 7 |
| 🟡 LOW | 2 |

> Automated static checks find likely problems; each finding should be confirmed by tracing the payment flow in the code. A clean report does not prove the integration is correct — Dashboard settings (webhook events, test vs live mode, Customer Portal) are not visible to the scanner.

## Webhook handling

### 🔴 HIGH — Stripe webhook `/api/webhooks/stripe` never verifies the signature

`app/api/webhooks/stripe/route.ts:6`

```
export async function POST(req: Request) {
```

**Why it matters:** Anyone can POST a fake `checkout.session.completed` or "invoice paid" event to this URL and get access without paying. The handler cannot tell Stripe from an attacker.

**Fix:** Read the raw body and verify it before doing anything: `const event = await stripe.webhooks.constructEventAsync(await request.text(), request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET)`; return 400 when it throws.

<sub>check: `webhook-no-signature`</sub>

### 🔴 HIGH — No Stripe webhook handles `customer.subscription.deleted`, `customer.subscription.updated`, `invoice.payment_failed`

`app/api/webhooks/stripe/route.ts:6`

```
export async function POST(req: Request) {
```

**Why it matters:** The app sells subscriptions, but access is only ever granted: when a customer cancels, a renewal payment fails or the plan changes, the database never hears about it and the user keeps paid access for free.

**Fix:** Handle `customer.subscription.updated` and `customer.subscription.deleted` (and `invoice.payment_failed` if you act on dunning), re-fetch the subscription from Stripe and store its `status`; check `status in (active, trialing)` when granting access. Enable the same events on the endpoint in the Dashboard.

<sub>check: `webhook-missing-events`</sub>

### 🟠 MEDIUM — Stripe webhook `/api/webhooks/billing` verifies a parsed body instead of the raw body

`app/api/webhooks/billing/route.ts:7`

```
const event = stripe.webhooks.constructEvent(
```

**Why it matters:** Stripe signs the exact raw bytes. A parsed and re-serialized body (`JSON.stringify(await req.json())`, or `req.body` with the Pages Router body parser on) does not match, so verification fails for every real event — paid customers never get access — or someone "fixes" it by removing verification.

**Fix:** Read the body once with `const body = await request.text()`, pass that string to `constructEventAsync`, and use the returned event instead of parsing the body yourself.

<sub>check: `webhook-parsed-body`</sub>

### 🟠 MEDIUM — Stripe webhook `/api/webhooks/stripe` has side effects but no deduplication by `event.id`

`app/api/webhooks/stripe/route.ts:12`

```
await db.insert(orders).values({ email: session.customer_details.email, paid: true });
```

**Why it matters:** Stripe delivers events at least once and retries on timeouts, so the same event can arrive twice (or concurrently). Without dedup you grant credits twice, send duplicate emails or create duplicate orders.

**Fix:** Store processed event ids in a table with a unique key and claim the id in the same transaction as the side effects: `insert into processed_events (id) values (event.id) on conflict do nothing` — if nothing was inserted, return 200 without doing anything.

<sub>check: `webhook-not-idempotent`</sub>

### 🟠 MEDIUM — Stripe webhook `/api/webhooks/stripe` answers 200 when processing fails

`app/api/webhooks/stripe/route.ts:19`

```
} catch (err) {
```

**Why it matters:** A 2xx response tells Stripe the event was handled, so it is never retried. A transient database error means a paying customer silently never gets access (or a cancellation is never applied).

**Fix:** Return a 5xx (or rethrow) when processing fails so Stripe retries; keep 400 for invalid signatures and 200 only after the work is committed.

<sub>check: `webhook-error-swallowed`</sub>

### 🟠 MEDIUM — Middleware requiring sign-in also runs on the Stripe webhook `/api/webhooks/billing`

`middleware.ts:12`

```
matcher: ["/api/:path*", "/dashboard/:path*"],
```

**Why it matters:** Stripe calls the webhook without a session cookie. If the middleware redirects or returns 401, every event fails, payments are never recorded and Stripe eventually disables the endpoint.

**Fix:** Exclude the webhook from the matcher (e.g. `"/((?!api/webhooks|_next/static|_next/image|favicon.ico).*)"`) or add `/api/webhooks/billing` to the public routes. The webhook authenticates with its signature instead.

<sub>check: `webhook-behind-auth`</sub>

### 🟠 MEDIUM — Middleware requiring sign-in also runs on the Stripe webhook `/api/webhooks/stripe`

`middleware.ts:12`

```
matcher: ["/api/:path*", "/dashboard/:path*"],
```

**Why it matters:** Stripe calls the webhook without a session cookie. If the middleware redirects or returns 401, every event fails, payments are never recorded and Stripe eventually disables the endpoint.

**Fix:** Exclude the webhook from the matcher (e.g. `"/((?!api/webhooks|_next/static|_next/image|favicon.ico).*)"`) or add `/api/webhooks/stripe` to the public routes. The webhook authenticates with its signature instead.

<sub>check: `webhook-behind-auth`</sub>

### 🟡 LOW — Stripe webhook `/api/webhooks/billing` returns an error for event types it doesn't handle

`app/api/webhooks/billing/route.ts:16`

```
default:
```

**Why it matters:** Stripe retries non-2xx responses for up to 3 days and may disable the endpoint. Events you don't care about (or new ones enabled later in the Dashboard) end up failing forever and hide real errors.

**Fix:** Acknowledge unhandled event types with 200 (optionally log them), and subscribe the endpoint only to the events you handle.

<sub>check: `webhook-unhandled-event-error`</sub>

## Checkout and fulfillment

### 🔴 HIGH — `checkout.sessions.create` uses an amount sent by the client

`app/actions.ts:16`

```
unit_amount: amount * 100,
```

**Why it matters:** The browser decides how much it pays: anyone can change the request to pay 1 cent for the product, and the webhook will still fulfil the order.

**Fix:** Never take amounts from the request. Look the product up on the server (catalog in code or the database) and use its Stripe price id, or compute the amount server-side from trusted data.

<sub>check: `client-controlled-price`</sub>

### 🔴 HIGH — `app/success/page.tsx` grants access from the checkout success redirect

`app/success/page.tsx:11`

```
await db.update(users).set({ plan: "pro" });
```

**Why it matters:** The success URL is just a link: anyone can open it with any `session_id` (or none) without paying, and asynchronous payment methods redirect before the money has settled. Access granted here is free access.

**Fix:** Grant access only from the verified webhook (`checkout.session.completed` with `payment_status === "paid"`). The success page should only show status. If you also fulfil there, retrieve the session with `stripe.checkout.sessions.retrieve`, check `payment_status` and the owner, and share one idempotent fulfil function with the webhook.

<sub>check: `fulfillment-on-success-page`</sub>

### 🟠 MEDIUM — Checkout session doesn't link the payment to a user or organization

`app/api/checkout/route.ts:7`

```
const session = await stripe.checkout.sessions.create({
```

**Why it matters:** Without `client_reference_id`, `metadata` or an existing `customer`, the webhook can only guess who paid (usually by email, which the buyer can change on the Checkout page), so access is granted to the wrong account or to nobody.

**Fix:** Pass `client_reference_id: organizationId` (or the user id) and the same id in `metadata` (and `subscription_data.metadata` for subscriptions), and read it back in the webhook.

<sub>check: `missing-reference`</sub>

### 🟠 MEDIUM — `checkout.sessions.create` uses a price id sent by the client

`app/api/checkout/route.ts:10`

```
line_items: [{ price: priceId, quantity: 1 }],
```

**Why it matters:** The browser can send any price id from your Stripe account — an old discounted price, a $1 test price, a one-time price instead of the yearly plan — and Checkout will happily charge it.

**Fix:** Accept a plan or product key from the client (validated with an enum) and map it to the price id on the server, e.g. `const price = PRICES[plan]` or a lookup by `lookup_key`.

<sub>check: `client-controlled-price`</sub>

## Keys and configuration

### 🔴 HIGH — Live Stripe key in `.env.local`

`.env.local:2`

```
STRIPE_SECRET_KEY=sk_live_…
```

**Why it matters:** Local development, tests and `stripe trigger` runs then create real charges, refunds and customers, and the key is copied to every laptop and tool that reads this file.

**Fix:** Use test-mode keys (and a `stripe listen` webhook secret) locally. Keep live keys only in the production environment of your host, and roll this key in the Dashboard if the file was ever shared.

<sub>check: `live-key-in-dev-files`</sub>

### 🔴 HIGH — Stripe secret exposed to the browser as `NEXT_PUBLIC_STRIPE_SECRET_KEY`

`.env.local:3`

```
NEXT_PUBLIC_STRIPE_SECRET_KEY=sk_test_…
```

**Why it matters:** Variables with a public prefix are inlined into the client bundle and visible to every visitor. With the secret key anyone can charge, refund and read your customers.

**Fix:** Rename it without the public prefix (e.g. `STRIPE_SECRET_KEY`), read it only on the server, and roll the key in the Dashboard. Only the publishable key (`pk_…`) belongs in the browser.

<sub>check: `secret-key-exposed`</sub>

### 🔴 HIGH — Stripe webhook signing secret hard-coded in source

`app/api/webhooks/billing/route.ts:10`

```
"whsec_…",
```

**Why it matters:** With the signing secret anyone can forge correctly signed events ("payment succeeded") and your webhook will trust them.

**Fix:** Read it from `process.env.STRIPE_WEBHOOK_SECRET` and roll the secret on the webhook endpoint in the Dashboard.

<sub>check: `webhook-secret-hardcoded`</sub>

### 🔴 HIGH — Client component uses the Stripe secret key or server SDK

`components/Pricing.tsx:6`

```
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2025-10-29.clover" });
```

**Why it matters:** Files with "use client" run in the browser. The secret key is either undefined there (broken checkout) or inlined into the bundle for every visitor to copy.

**Fix:** Create Checkout sessions in a route handler or server action and send only the session URL to the browser. Client code should use `@stripe/stripe-js` with the publishable key.

<sub>check: `secret-key-exposed`</sub>

### 🔴 HIGH — Stripe secret key (live mode) hard-coded in source

`lib/stripe.ts:4`

```
export const stripe = new Stripe("sk_live_…");
```

**Why it matters:** The secret key can create charges, issue refunds and read every customer. In code it ends up in git history, logs and possibly the client bundle.

**Fix:** Read it from `process.env.STRIPE_SECRET_KEY` in a server-only module validated at startup, and roll the key in the Dashboard (Developers → API keys): it must be considered leaked.

<sub>check: `secret-key-exposed`</sub>

### 🟡 LOW — Stripe client created without `apiVersion`

`lib/stripe.ts:4`

```
export const stripe = new Stripe("sk_live_…");
```

**Why it matters:** Without an explicit version, upgrading the `stripe` package (or, on old SDKs, changing the account default) silently changes the shape of API responses and webhook payloads your code relies on.

**Fix:** Pass the version you tested with: `new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "<version>" })`, and upgrade it deliberately (the webhook endpoint has its own version in the Dashboard).

<sub>check: `api-version-unpinned`</sub>
