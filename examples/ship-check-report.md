# Ship check report

- **Project:** unready-app
- **Generated:** 2026-11-18T13:05:26.988Z
- **Framework:** Next.js (App Router) · **Package manager:** npm
- **Files scanned:** 9

**Automated verdict: Not ready** — 2 blockers, 30 warnings, 11 manual checks, 2 passed.

| Status | Items |
| --- | --- |
| ❌ FAIL | 2 |
| ⚠️ WARN | 30 |
| 🖐 MANUAL | 11 |
| ✅ PASS | 2 |

> Static checks only. Confirm each FAIL and WARN by reading the code, run the real build, lint, typecheck and tests, and go through the MANUAL items with whoever owns the hosting and domain. For security, run the security-audit skill.

## Blockers

- `typescript.ignoreBuildErrors: true` ships TypeScript errors to production (`next.config.mjs:4`)
- `eslint.ignoreDuringBuilds: true` ships lint errors to production (`next.config.mjs:7`)

## Build hygiene

### ❌ FAIL — `typescript.ignoreBuildErrors: true` ships TypeScript errors to production

`next.config.mjs:4`

```
ignoreBuildErrors: true,
```

**Why it matters:** AI tools often add this to make a failing build go green. The errors are still there; they just surface as crashes in front of users instead of in the build log.

**Fix:** Remove `typescript.ignoreBuildErrors`, run `npm run build` and fix the errors it reports.

<sub>check: `build-errors-ignored`</sub>

### ❌ FAIL — `eslint.ignoreDuringBuilds: true` ships lint errors to production

`next.config.mjs:7`

```
ignoreDuringBuilds: true,
```

**Why it matters:** AI tools often add this to make a failing build go green. The errors are still there; they just surface as crashes in front of users instead of in the build log.

**Fix:** Remove `eslint.ignoreDuringBuilds`, run `npm run build` and fix the errors it reports.

<sub>check: `build-errors-ignored`</sub>

### ⚠️ WARN — No `lint`, `typecheck` or `test` script

`package.json`

**Why it matters:** Without one command per quality gate, nobody (you, the client's next developer, CI) can tell whether a change broke something.

**Fix:** Add the missing scripts, e.g. `"lint": "eslint ."`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, and run them in CI.

<sub>check: `script-quality`</sub>

### ⚠️ WARN — TypeScript `strict` mode is off

`tsconfig.json:5`

```
"strict": false,
```

**Why it matters:** Without strict mode, `undefined` and `null` slip through the type checker, the most common source of runtime crashes in generated code.

**Fix:** Set `"strict": true` in `compilerOptions` and fix the errors (often quick, and each one is a real bug candidate).

<sub>check: `ts-strict`</sub>

### ⚠️ WARN — No lockfile

**Why it matters:** Without a lockfile every install can resolve different dependency versions, so the build you tested is not the build you deploy.

**Fix:** Run `npm install` and commit the lockfile it creates.

<sub>check: `lockfile`</sub>

### ⚠️ WARN — `Dockerfile` found but `output: "standalone"` is not set

`next.config.mjs`

**Why it matters:** Without standalone output the image has to ship the full node_modules: large, slow to deploy, and easy to get wrong.

**Fix:** Add `output: "standalone"` to next.config and copy `.next/standalone` and `.next/static` in the Dockerfile.

<sub>check: `docker-standalone`</sub>

- ✅ PASS `build` script present (`next build`)

## Configuration

### ⚠️ WARN — Environment variables are read without validation

- `lib/email.ts:3` — `const resend = new Resend(process.env.RESEND_API_KEY);`
- `lib/stripe.ts:3` — `export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);`
- `lib/supabase.ts:4` — `process.env.NEXT_PUBLIC_SUPABASE_URL as string,`

**Why it matters:** A missing or mistyped variable in the hosting dashboard then fails at runtime, on the first request that needs it, instead of failing the deploy with a clear message.

**Fix:** Add one `env.ts` that parses `process.env` with a schema (Zod or `@t3-oss/env-nextjs`) and import variables from it instead of reading `process.env` directly.

<sub>check: `env-validation`</sub>

### ⚠️ WARN — `.env.example` is missing 3 variables: `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`

- `lib/email.ts:3` — `const resend = new Resend(process.env.RESEND_API_KEY);`
- `lib/stripe.ts:3` — `export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);`
- `lib/supabase.ts:10` — `process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY as string,`

**Why it matters:** Undocumented variables are the ones that get forgotten when the app is deployed to a new environment or handed over.

**Fix:** Add the missing names to `.env.example` with placeholder values (never real ones).

<sub>check: `env-example`</sub>

### ⚠️ WARN — Secret-looking variable exposed to the browser: `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`

`lib/supabase.ts:10`

```
process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY as string,
```

**Why it matters:** `NEXT_PUBLIC_` variables are inlined into the JavaScript every visitor downloads.

**Fix:** Run the security-audit skill: it checks client exposure in depth. Usually: drop the prefix, read the value only on the server, and rotate the key.

<sub>check: `public-env-secret`</sub>

## Error handling and UX

### ⚠️ WARN — No `app/error.tsx`

**Why it matters:** Without it, any exception in a server or client component replaces the whole page with Next.js's bare 'Application error' screen, with no way back.

**Fix:** Add `app/error.tsx` (a client component with a friendly message and a `reset()` button). Add more in route segments that can fail on their own.

<sub>check: `error-boundary`</sub>

### ⚠️ WARN — No `app/global-error.tsx`

**Why it matters:** `error.tsx` cannot catch errors thrown by the root layout itself; `global-error.tsx` is the last line of defense.

**Fix:** Add `app/global-error.tsx` (client component that renders its own `<html>` and `<body>`).

<sub>check: `global-error`</sub>

### ⚠️ WARN — No `app/not-found.tsx`

**Why it matters:** Broken links and old URLs show the default unstyled 404 page, without your navigation or a way back.

**Fix:** Add `app/not-found.tsx` with your layout and a link home.

<sub>check: `not-found`</sub>

### ⚠️ WARN — No `loading.tsx` in any route

**Why it matters:** Pages that fetch data show nothing while they load; on a slow connection users think the app is broken and click again.

**Fix:** Add `loading.tsx` (a skeleton or spinner) to the route segments that fetch data. Ignore this if every page is static.

<sub>check: `loading-states`</sub>

## SEO and sharing

### ⚠️ WARN — Root layout exports no `metadata` or `generateMetadata`

`app/layout.tsx`

**Why it matters:** Search results and shared links show the URL or 'Create Next App' instead of the product name and a description.

**Fix:** Export `metadata` from the root layout: `export const metadata = { title: { default: "Name", template: "%s · Name" }, description: "..." }`.

<sub>check: `metadata`</sub>

### ⚠️ WARN — `metadataBase` is not set

`app/layout.tsx`

**Why it matters:** Open Graph and canonical URLs are resolved against it; without it they point to localhost or the preview URL, and shared links show no image.

**Fix:** Add `metadataBase: new URL(env.SITE_URL)` to the root metadata, with the production URL coming from an environment variable.

<sub>check: `metadata-base`</sub>

### ⚠️ WARN — No robots.txt

**Why it matters:** Crawlers get no guidance (and no sitemap link); preview or admin areas you meant to hide can be indexed.

**Fix:** Add `app/robots.ts` returning `{ rules: { userAgent: "*", allow: "/" }, sitemap: "https://<domain>/sitemap.xml" }`.

<sub>check: `robots`</sub>

### ⚠️ WARN — No sitemap

**Why it matters:** Search engines discover pages more slowly, and Google Search Console has nothing to submit.

**Fix:** Add `app/sitemap.ts` listing the public URLs.

<sub>check: `sitemap`</sub>

### ⚠️ WARN — No favicon

**Why it matters:** Browser tabs, bookmarks and home-screen shortcuts show a blank or default icon: the first thing a client notices.

**Fix:** Add `app/icon.png` (or `favicon.ico`); Next.js wires it up automatically.

<sub>check: `favicon`</sub>

### ⚠️ WARN — No Open Graph image

**Why it matters:** Links shared on WhatsApp, LinkedIn, Slack or X show a bare URL instead of a preview card.

**Fix:** Add `app/opengraph-image.png` (1200×630) or generate one with `opengraph-image.tsx`.

<sub>check: `og-image`</sub>

### ⚠️ WARN — `<html>` has no `lang` attribute

`app/layout.tsx:6`

```
<html>
```

**Why it matters:** Screen readers guess the language and browsers offer to translate the page; it is also an accessibility audit failure.

**Fix:** Set it in the root layout: `<html lang="en">` (the site's language).

<sub>check: `html-lang`</sub>

## Performance

### ⚠️ WARN — 2 raw `<img>` tags instead of `next/image`

- `app/page.tsx:8` — `<img src="/hero.jpg" alt="Our team at work" />`
- `app/page.tsx:11` — `<img key={s.id} src={s.photo_url} alt={s.name} />`

**Why it matters:** Raw images ship at full size to phones, load without lazy-loading and shift the layout as they appear: the usual cause of a poor Lighthouse/Core Web Vitals score.

**Fix:** Use `<Image>` from `next/image` with `width`/`height` (or `fill` + `sizes`). Add remote hosts to `images.remotePatterns`.

<sub>check: `raw-img`</sub>

### ⚠️ WARN — Google Fonts loaded from fonts.googleapis.com

`app/layout.tsx:8`

```
<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />
```

**Why it matters:** An extra blocking request to a third-party domain on every page: slower first paint, layout shift when the font swaps, and visitor IPs sent to Google (a GDPR complaint in the EU).

**Fix:** Use `next/font/google`: it self-hosts the font at build time with no layout shift.

<sub>check: `external-fonts`</sub>

- ✅ PASS No files over 1 MB in `public/`

## Security basics

### ⚠️ WARN — No security headers configured

`next.config.mjs`

**Why it matters:** Without them the site can be framed for clickjacking and has no second line of defense against XSS.

**Fix:** Return them for `/:path*` from `headers()` in next.config (or set them in middleware). The security-audit skill lists exactly which ones are missing.

<sub>check: `security-headers`</sub>

### ⚠️ WARN — `X-Powered-By: Next.js` header is sent

`next.config.mjs`

**Why it matters:** Advertises the framework to automated scanners looking for known vulnerable versions. Minor, but free to fix.

**Fix:** Add `poweredByHeader: false` to next.config.

<sub>check: `powered-by-header`</sub>

- [ ] 🖐 MANUAL **Run the security-audit skill** — This checklist only covers the basics. Leaked keys, routes without auth, queries that leak other customers' data, unverified webhooks and Supabase tables without RLS are what actually get apps breached. *How:* Ask your agent to "run a security audit" (`npx skills add kitwright-ai/skills --skill security-audit`) and fix every confirmed high finding before launch.

## Observability

### ⚠️ WARN — No error tracking or structured logging

**Why it matters:** When something breaks after launch you find out from the client, with no stack trace, no request and no idea how many users were affected.

**Fix:** Add an error tracker (Sentry's free tier is enough to start: `npx @sentry/wizard@latest -i nextjs`) or at least a structured logger whose output your host keeps and alerts on.

<sub>check: `error-tracking`</sub>

### ⚠️ WARN — 3 `console.log` calls in 3 files

- `app/dashboard/page.tsx:5` — `console.log(invoices);`
- `app/page.tsx:5` — `console.log("services", data);`
- `lib/supabase.ts:14` — `console.log("signing up", email);`

**Why it matters:** Debug logging left in by the agent: noise in production logs, and on the server it often prints request bodies, tokens or personal data.

**Fix:** Remove debug logs; keep intentional ones as `console.error`/`console.warn` or a logger, and never log secrets or full request bodies.

<sub>check: `console-log`</sub>

## Data

### ⚠️ WARN — Supabase is used but no migrations are in the repo

**Why it matters:** The schema, RLS policies and functions only exist in the Supabase dashboard: they can't be reviewed, recreated for staging, or handed over with the code.

**Fix:** Run `supabase db pull` (Supabase CLI) to capture the current schema as `supabase/migrations/*.sql`, commit it, and make future changes as migrations.

<sub>check: `migrations`</sub>

### ⚠️ WARN — No seed script

**Why it matters:** Every new environment (staging, the client's own account, the next developer's laptop) starts empty, and required rows (plans, roles, settings) get created by hand.

**Fix:** Add a `"db:seed"` script that creates the required reference data idempotently (and optional demo data for development).

<sub>check: `seed`</sub>

- [ ] 🖐 MANUAL **Backups for the production database (Supabase)** — A bad migration, a delete without `where`, or a compromised key can wipe production. Many free plans keep no backups, or only for a day. *How:* Confirm automated backups are on and how long they are kept (on Supabase, restorable daily backups need a paid plan; on Neon, RDS or others check the retention window), and do one test restore before launch.

## Legal and trust

### ⚠️ WARN — No privacy policy page

**Why it matters:** Required as soon as you collect any personal data (sign-up, contact form, analytics) under GDPR, UK GDPR and CCPA; Google OAuth verification and the app stores ask for its URL too.

**Fix:** Add a `/privacy` page (for a client project, the client supplies or approves the text) and link it from the footer and sign-up form.

<sub>check: `privacy-policy`</sub>

### ⚠️ WARN — No terms of service page

**Why it matters:** Without terms there are no stated rules on acceptable use, liability, refunds or termination, which matters most when the app takes payments or user content.

**Fix:** Add a `/terms` page (for a client project, the client supplies or approves the text) and link it from the footer and sign-up form.

<sub>check: `terms`</sub>

### ⚠️ WARN — Google Analytics / Tag Manager loaded without a cookie consent banner

`app/layout.tsx:12`

```
<Script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX" />
```

**Why it matters:** In the EU and UK, tracking cookies need opt-in consent before they are set; regulators and ad platforms both enforce it, and the client carries the liability.

**Fix:** Load the tracking scripts only after consent (a consent banner or a CMP, and Google Consent Mode for GA), or switch to a cookieless analytics tool. Required if any visitors are in the EU/UK.

<sub>check: `cookie-consent`</sub>

## Email

### ⚠️ WARN — Email is sent from a test address

`lib/email.ts:7`

```
from: "onboarding@resend.dev",
```

**Why it matters:** `onboarding@resend.dev` only delivers to the email address of your own Resend account: customers never get the email.

**Fix:** Verify your own sending domain with the provider and send from an address on it, read from an environment variable (e.g. `EMAIL_FROM`).

<sub>check: `test-sender`</sub>

- [ ] 🖐 MANUAL **SPF, DKIM and DMARC for the sending domain (Resend)** — Without them, password resets, invoices and notifications land in spam or are rejected; Gmail and Yahoo reject bulk mail from unauthenticated domains. *How:* Add the DNS records your provider shows for the domain, wait until it reports them as verified, add a DMARC record (`v=DMARC1; p=none; rua=mailto:...` to start), and send a test to Gmail and Outlook.
- [ ] 🖐 MANUAL **Custom SMTP for Supabase Auth emails** — Supabase's built-in email service is for testing: it sends only a few emails per hour and only to team members' addresses, so sign-up confirmations and password resets fail for real users. *How:* In Supabase → Authentication → Emails → SMTP settings, configure your email provider's SMTP, and customize the email templates and sender name.

## Launch day (manual)

- [ ] 🖐 MANUAL **Custom domain with HTTPS, and the other hostname redirects** — Clients and their customers judge the app by its URL; a `*.vercel.app` address or a certificate warning looks unfinished. *How:* Point the domain at the host, confirm the certificate is issued, redirect `www` to the apex (or the reverse), and check the old preview URL isn't the one being shared.
- [ ] 🖐 MANUAL **Environment variables set in the hosting provider (5 used in code)** — Values in your local `.env` don't travel with the code; one missing variable in production is the most common launch-day outage. *How:* Set every variable for the Production environment (not only Preview): `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. Use production values (live keys, production URLs), then redeploy.
- [ ] 🖐 MANUAL **Production points at a production database** — Apps built in a hurry often launch on the development database: test data in front of customers, and every experiment risks real data. *How:* Use a separate project/database for production, apply migrations to it, and check the production `DATABASE_URL` (or Supabase URL) is not the dev one.
- [ ] 🖐 MANUAL **Auth callback and site URLs use the production domain (Supabase Auth)** — OAuth and magic links still configured for `localhost` or the preview URL break sign-in on launch day. *How:* Update the site URL and allowed redirect URLs (Supabase → Authentication → URL configuration; Google/GitHub OAuth app callback URLs; `BETTER_AUTH_URL`/`NEXTAUTH_URL`) and sign in once on the production domain.
- [ ] 🖐 MANUAL **Stripe live mode: live keys, live webhook endpoint, account activated** — Test keys accept fake cards only; a webhook endpoint created in test mode never receives live events, so payments succeed but orders are never fulfilled. *How:* Activate the account, set live `sk_live_`/`pk_live_` keys in production, create the webhook endpoint in live mode for the production URL with its own signing secret, and make one real purchase and refund.
- [ ] 🖐 MANUAL **Uptime monitoring and alerts** — Without a check that runs every few minutes, the first person to notice an outage is a customer or the client. *How:* Add a free uptime monitor (Better Stack, UptimeRobot, Checkly) on the home page and one critical route, alerting the person who will fix it.
- [ ] 🖐 MANUAL **Rollback plan** — If the launch deploy breaks something, you need to know in advance how to go back in minutes, including what happens to database changes. *How:* Know how to promote the previous deployment (Vercel: Instant Rollback; Docker: previous image tag), keep migrations backward compatible, and write the steps down for the client.
