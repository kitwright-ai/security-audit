# Security audit report

- **Project:** insecure-app
- **Generated:** 2026-11-18T12:32:10.520Z
- **Files scanned:** 15 (Next.js) · Supabase

| Severity | Findings |
| --- | --- |
| 🔴 HIGH | 17 |
| 🟠 MEDIUM | 7 |
| 🟡 LOW | 0 |

> Automated static checks find likely problems; each finding should be confirmed by reading the code. A clean report does not prove the app is secure.

## Secrets and client exposure

### 🔴 HIGH — Environment file is committed to git

`.env.production:1`

```
NEXT_P…
```

**Why it matters:** Env files hold real credentials. Anything in git history is effectively public to everyone with repo access, forever.

**Fix:** Add `.env*` (with `!.env.example`) to .gitignore, remove the file from git (`git rm --cached`), and rotate every secret it contained.

<sub>check: `env-file-committed`</sub>

### 🔴 HIGH — Stripe live secret key in source

`.env.production:1`

```
NEXT_P…
```

**Why it matters:** Secrets in code are exposed to anyone who can read the repository or the built bundle.

**Fix:** Move it to an environment variable validated at startup, and rotate the key (it must be considered leaked).

<sub>check: `hardcoded-secret`</sub>

### 🔴 HIGH — Secret-looking variable `NEXT_PUBLIC_STRIPE_SECRET_KEY` is exposed to the browser

`.env.production:1`

```
NEXT_P…
```

**Why it matters:** Variables prefixed with NEXT_PUBLIC_ are inlined into the client bundle and visible to every visitor.

**Fix:** Rename it without the NEXT_PUBLIC_ prefix and only read it on the server (route handlers, server actions, server components).

<sub>check: `public-env-secret`</sub>

### 🔴 HIGH — Database URL with password in source

`.env.production:2`

```
DATABASE_URL=postgres://admin:Sup3rS…@db.prod.acme-corp.io:5432/app
```

**Why it matters:** A connection string with credentials gives direct access to your data.

**Fix:** Read it from `DATABASE_URL` and rotate the database password.

<sub>check: `hardcoded-secret`</sub>

### 🔴 HIGH — Client component reads server variable `SUPABASE_SERVICE_ROLE_KEY`

`components/AdminPanel.tsx:8`

```
process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
```

**Why it matters:** Client components run in the browser. The value is undefined there unless it is inlined, in which case it leaks; either way the secret-handling code belongs on the server.

**Fix:** Move the logic that needs this variable to a server action, route handler or server component.

<sub>check: `client-secret-env`</sub>

### 🔴 HIGH — Stripe live secret key in source

`lib/stripe.ts:3`

```
export const stripe = new Stripe("sk_liv…");
```

**Why it matters:** Secrets in code are exposed to anyone who can read the repository or the built bundle.

**Fix:** Move it to an environment variable validated at startup, and rotate the key (it must be considered leaked).

<sub>check: `hardcoded-secret`</sub>

### 🔴 HIGH — `STRIPE_SECRET_KEY` is inlined into the client bundle by next.config `env`

`next.config.js:4`

```
STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
```

**Why it matters:** Values in next.config `env` are replaced at build time in client code too.

**Fix:** Remove it from `env` and read `process.env` only on the server.

<sub>check: `public-env-secret`</sub>

## Authentication of routes and server actions

### 🔴 HIGH — Server action `deleteProject` has no authentication

`app/actions.ts:7`

```
export async function deleteProject(id: string) {
```

**Why it matters:** Every exported function in a "use server" file is a public HTTP endpoint that anyone can call with any arguments.

**Fix:** Check the session and permission inside the action (e.g. `withAuth({ permission, input }, handler)`) and validate the input with Zod.

<sub>check: `action-without-auth`</sub>

### 🔴 HIGH — Route handler `GET, DELETE /api/invoices` has no authentication

`app/api/invoices/route.ts:4`

```
export async function GET() {
```

**Why it matters:** Anyone on the internet can call this endpoint directly; the UI hiding a button does not protect it.

**Fix:** Authenticate and authorize at the start of every handler (e.g. wrap it in `withAuthRoute({ permission })`). If it is intentionally public, add a `// security-audit: public <reason>` comment and rate limit it.

<sub>check: `route-without-auth`</sub>

### 🔴 HIGH — Inline server action has no authentication

`app/dashboard/page.tsx:4`

```
async function rename(formData: FormData) {
```

**Why it matters:** Inline server actions are callable endpoints too; being declared inside a protected page does not protect them.

**Fix:** Check the session and permission inside the action body.

<sub>check: `action-without-auth`</sub>

## Tenant / user scoping of queries

### 🔴 HIGH — Query on `projects` is not filtered by organization or user

`app/actions.ts:8`

```
await db.delete(projects).where(eq(projects.id, id));
```

**Why it matters:** Without an organization/user filter, one customer can read or change another customer's data by guessing or changing an id (IDOR).

**Fix:** Always filter by the tenant from the session, e.g. `where(scoped(table, organizationId, eq(table.id, id)))` or `where: { id, organizationId }`. If the table is global, add `// security-audit-ignore query-without-tenant-filter <reason>`.

<sub>check: `query-without-tenant-filter`</sub>

### 🔴 HIGH — Query on `invoices` is not filtered by organization or user

`app/api/invoices/[id]/route.ts:9`

```
await db.delete(invoices).where(eq(invoices.id, params.id));
```

**Why it matters:** Without an organization/user filter, one customer can read or change another customer's data by guessing or changing an id (IDOR).

**Fix:** Always filter by the tenant from the session, e.g. `where(scoped(table, organizationId, eq(table.id, id)))` or `where: { id, organizationId }`. If the table is global, add `// security-audit-ignore query-without-tenant-filter <reason>`.

<sub>check: `query-without-tenant-filter`</sub>

### 🔴 HIGH — Query on `invoices` is not filtered by organization or user

`app/api/invoices/route.ts:11`

```
await db.delete(invoices);
```

**Why it matters:** Without an organization/user filter, one customer can read or change another customer's data by guessing or changing an id (IDOR).

**Fix:** Always filter by the tenant from the session, e.g. `where(scoped(table, organizationId, eq(table.id, id)))` or `where: { id, organizationId }`. If the table is global, add `// security-audit-ignore query-without-tenant-filter <reason>`.

<sub>check: `query-without-tenant-filter`</sub>

### 🔴 HIGH — Query on `projects` is not filtered by organization or user

`app/dashboard/page.tsx:6`

```
await db.update(projects).set({ name: String(formData.get("name")) });
```

**Why it matters:** Without an organization/user filter, one customer can read or change another customer's data by guessing or changing an id (IDOR).

**Fix:** Always filter by the tenant from the session, e.g. `where(scoped(table, organizationId, eq(table.id, id)))` or `where: { id, organizationId }`. If the table is global, add `// security-audit-ignore query-without-tenant-filter <reason>`.

<sub>check: `query-without-tenant-filter`</sub>

### 🟠 MEDIUM — Query on `invoices` is not filtered by organization or user

`app/api/invoices/route.ts:5`

```
const rows = await db.select().from(invoices);
```

**Why it matters:** Without an organization/user filter, one customer can read or change another customer's data by guessing or changing an id (IDOR).

**Fix:** Always filter by the tenant from the session, e.g. `where(scoped(table, organizationId, eq(table.id, id)))` or `where: { id, organizationId }`. If the table is global, add `// security-audit-ignore query-without-tenant-filter <reason>`.

<sub>check: `query-without-tenant-filter`</sub>

## Webhook signature verification

### 🔴 HIGH — Webhook `/api/webhooks/stripe` does not verify the sender's signature

`app/api/webhooks/stripe/route.ts:2`

```
export async function POST(request: Request) {
```

**Why it matters:** Anyone can POST a fake event (e.g. "payment succeeded") to this URL and the app will act on it.

**Fix:** Verify the signature on the raw body before doing anything, e.g. `stripe.webhooks.constructEventAsync(await request.text(), signature, secret)`, and make processing idempotent by event id.

<sub>check: `webhook-without-signature`</sub>

### 🟠 MEDIUM — Webhook `/api/webhooks/billing` parses JSON instead of verifying the raw body

`app/api/webhooks/billing/route.ts:5`

```
const body = JSON.stringify(await request.json());
```

**Why it matters:** Signatures are computed over the exact raw bytes. `JSON.stringify(await request.json())` changes them, so verification is wrong or ends up disabled.

**Fix:** Read the body once with `await request.text()`, verify it, then parse the verified event.

<sub>check: `webhook-parsed-body`</sub>

## Rate limiting and security headers

### 🟠 MEDIUM — Public server action `signUp` has no rate limiting

`app/actions.ts:11`

```
export async function signUp(email: string) {
```

**Why it matters:** Server actions are HTTP endpoints; public ones can be called in a loop.

**Fix:** Rate limit by IP (from `headers()`) and by target account before doing any work.

<sub>check: `public-route-without-rate-limit`</sub>

### 🟠 MEDIUM — Public endpoint `/api/auth/login` has no rate limiting

`app/api/auth/login/route.ts:2`

```
export async function POST(request: Request) {
```

**Why it matters:** Unauthenticated endpoints (sign-in, sign-up, password reset, forms, bookings) are the first target of credential stuffing, spam and enumeration.

**Fix:** Limit requests per IP and per account (e.g. a sliding window in middleware/proxy or at the start of the handler) and return 429 with Retry-After.

<sub>check: `public-route-without-rate-limit`</sub>

### 🟠 MEDIUM — Public endpoint `/api/webhooks/stripe` has no rate limiting

`app/api/webhooks/stripe/route.ts:2`

```
export async function POST(request: Request) {
```

**Why it matters:** Unauthenticated endpoints (sign-in, sign-up, password reset, forms, bookings) are the first target of credential stuffing, spam and enumeration.

**Fix:** Limit requests per IP and per account (e.g. a sliding window in middleware/proxy or at the start of the handler) and return 429 with Retry-After.

<sub>check: `public-route-without-rate-limit`</sub>

### 🟠 MEDIUM — Missing security headers: Content-Security-Policy, X-Frame-Options or CSP frame-ancestors, X-Content-Type-Options, Strict-Transport-Security, Referrer-Policy

`next.config.js:1`

**Why it matters:** Security headers block clickjacking, MIME sniffing, downgrade attacks and limit the damage of XSS.

**Fix:** Add them for all routes in `next.config` `headers()` (or in middleware/proxy): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, and a `Content-Security-Policy`.

<sub>check: `missing-security-headers`</sub>

## Supabase row level security

### 🔴 HIGH — Policy on `profiles` allows anyone to change every row (`true`)

`supabase/migrations/0001_init.sql:3`

```
create policy "anyone can edit" on public.profiles for all using (true) with check (true);
```

**Why it matters:** `using (true)` / `with check (true)` applies to every row for every caller, which is the same as having no policy for that operation.

**Fix:** Restrict to the owner or organization, e.g. `using (auth.uid() = user_id)` / `using (organization_id in (select organization_id from members where user_id = auth.uid()))`.

<sub>check: `supabase-permissive-policy`</sub>

### 🔴 HIGH — Table `invoices` does not have row level security enabled

`supabase/migrations/0001_init.sql:6`

```
create table public.invoices (id uuid primary key, organization_id uuid, amount int);
```

**Why it matters:** Anyone with your public anon key (it ships in the browser) can read, insert, update and delete every row.

**Fix:** `alter table public.invoices enable row level security;` then add policies scoped to `auth.uid()` or organization membership.

<sub>check: `supabase-rls-disabled`</sub>

### 🟠 MEDIUM — Policy on `products` allows anyone to read every row (`true`)

`supabase/migrations/0001_init.sql:10`

```
create policy "public catalog" on public.products for select using (true);
```

**Why it matters:** `using (true)` / `with check (true)` applies to every row for every caller, which is the same as having no policy for that operation.

**Fix:** If the data is truly public (e.g. a product catalog) keep it and add `-- security-audit-ignore supabase-permissive-policy`; otherwise filter by `auth.uid()` or organization membership.

<sub>check: `supabase-permissive-policy`</sub>
