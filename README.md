# Security audit skill for AI-built Next.js apps

A free agent skill (Claude Code, Cursor, Codex) plus a zero-dependency scanner that finds the
security problems AI-generated apps usually ship with:

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

## Use with an agent

Copy this folder to `.claude/skills/security-audit/` (Claude Code) or your agent's skills
folder and ask: *"run a security audit"*. The agent runs the scanner, verifies each finding by
reading the code, checks what static analysis can't, writes `security-audit-report.md` and
offers fixes.

## Use the scanner directly

```bash
node scripts/audit.mjs path/to/app                       # Markdown to stdout
node scripts/audit.mjs path/to/app --out report.md
node scripts/audit.mjs path/to/app --json
node scripts/audit.mjs path/to/app --fail-on high         # CI: exit 1 on high findings
```

Node 18+, no install, read-only.

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

MIT © Kitwright — part of [kitwright.ai](https://kitwright.ai) production-ready kits.
