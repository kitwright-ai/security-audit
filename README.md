# Security audit skill for AI-built Next.js apps

A free agent skill (Claude Code, Cursor, Codex) plus a zero-dependency scanner that finds the
security problems AI-generated apps usually ship with. Made by [Kitwright](https://kitwright.ai)
— production-ready Next.js kits for apps built with AI.

```bash
npx skills add kitwright-ai/security-audit
```

Then ask your agent: *"run a security audit"*.

## What it checks

| Check | What it catches |
| --- | --- |
| `hardcoded-secret` | Stripe/AWS/GitHub/OpenAI/Resend keys, private keys, Supabase `service_role` JWTs, DB URLs with passwords |
| `env-file-committed` / `env-file-not-ignored` | `.env` files in git or not git-ignored |
| `public-env-secret` | `NEXT_PUBLIC_*SECRET*`-style variables and secrets inlined via `next.config` `env` |
| `client-secret-env` | Client components reading server-only variables |
| `route-without-auth` | Route handlers with no authentication |
| `action-without-auth` | Server actions (file-level and inline) with no authentication |
| `query-without-tenant-filter` | Drizzle / Prisma / raw SQL queries not filtered by organization or user (IDOR) |
| `webhook-without-signature` / `webhook-parsed-body` | Webhooks that trust the payload or verify a re-serialized body |
| `public-route-without-rate-limit` | Sign-in, sign-up, forms and public actions without rate limiting |
| `missing-security-headers` | CSP, frame protection, nosniff, HSTS, Referrer-Policy |
| `supabase-rls-disabled` / `supabase-permissive-policy` / `supabase-rls-no-policies` / `supabase-rls-unverified` | Tables exposed to the anon key |

## Example report

This is the scanner's output on [`fixtures/insecure-app`](fixtures/insecure-app), a deliberately
insecure Next.js + Supabase project: **17 high and 7 medium findings**. Read the full report in
[`examples/report.md`](examples/report.md). An excerpt:

> ### 🔴 HIGH — Route handler `GET, DELETE /api/invoices` has no authentication
>
> `app/api/invoices/route.ts:4`
>
> ```
> export async function GET() {
> ```
>
> **Why it matters:** Anyone on the internet can call this endpoint directly; the UI hiding a
> button does not protect it.
>
> **Fix:** Authenticate and authorize at the start of every handler (e.g. wrap it in
> `withAuthRoute({ permission })`). If it is intentionally public, add a
> `// security-audit: public <reason>` comment and rate limit it.

With the skill, the agent goes further than the scanner: it confirms or dismisses each finding
by reading the code, checks what static analysis can't (authorization logic, file uploads,
CORS), writes `security-audit-report.md` and offers fixes.

## Install

Requires Node.js 22.20+ for the installer; the scanner itself runs on Node 18+.

```bash
npx skills add kitwright-ai/security-audit                 # pick your agents interactively
npx skills add kitwright-ai/security-audit -a claude-code  # Claude Code only (.claude/skills/)
npx skills add kitwright-ai/security-audit -g              # all your projects
```

[`skills`](https://github.com/vercel-labs/skills) installs to Claude Code (`.claude/skills/`),
Cursor and Codex (`.agents/skills/`) and many other agents. Only the skill folder is installed —
[`skills/security-audit`](skills/security-audit): `SKILL.md`, the scanner and the license. The
test fixtures stay here.

Prefer not to use the installer? Copy [`skills/security-audit`](skills/security-audit) into your
agent's skills folder (e.g. `.claude/skills/security-audit/`).

## Use the scanner directly

From a clone of this repo, or from the installed skill folder:

```bash
node skills/security-audit/scripts/audit.mjs path/to/app                   # Markdown to stdout
node skills/security-audit/scripts/audit.mjs path/to/app --out report.md
node skills/security-audit/scripts/audit.mjs path/to/app --json
node skills/security-audit/scripts/audit.mjs path/to/app --fail-on high    # CI: exit 1 on high findings
```

No dependencies, read-only.

## Silencing a reviewed finding

```ts
// security-audit-ignore query-without-tenant-filter plans are global
// security-audit: public — waitlist form (route is public on purpose; still rate limited)
// security-audit-ignore-file hardcoded-secret
```

## Limits

Static heuristics: it can miss issues (auth in middleware, authorization bugs, business logic)
and flag safe code. The skill's instructions make the agent verify every finding and check the
rest manually. A clean report is not a guarantee.

## More from Kitwright

This skill checks the rules that [Kitwright](https://kitwright.ai) kits enforce by design: every
route and action behind an auth wrapper, tenant-scoped queries, verified idempotent webhooks,
secrets validated at startup, rate limits and security headers — plus the `AGENTS.md`, skills and
commands that keep your coding agent inside them. See [kitwright.ai](https://kitwright.ai).

MIT © Kitwright
