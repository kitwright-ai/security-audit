# Kitwright skills

Free agent skills for Next.js apps built with AI — Claude Code, Cursor, Codex and any agent that
reads skills. Each one pairs instructions for your agent with a zero-dependency scanner, so the
agent works from real findings in your code instead of generic advice.

Made by [Kitwright](https://kitwright.ai) — production-ready Next.js kits for apps built with AI.

```bash
npx skills add kitwright-ai/skills
```

Pick the skills and agents you want, then ask your agent in plain words: *"run a security
audit"*, *"is this ready to launch?"*, *"write an AGENTS.md for this project"*.

## Skills

| Skill | Ask your agent | What it does | Example output |
| --- | --- | --- | --- |
| [**security-audit**](skills/security-audit) | "run a security audit" | Finds leaked secrets, `NEXT_PUBLIC_` keys, routes and server actions without auth, queries without tenant filters (IDOR), unverified webhooks, missing rate limits and security headers, and Supabase tables without RLS. | [report](examples/security-audit-report.md) |
| [**stripe-audit**](skills/stripe-audit) | "check my Stripe integration" | Catches the Stripe mistakes that lose money or give away access: unsigned or non-idempotent webhooks, subscriptions never revoked, access granted from the success page, prices sent by the client, leaked keys. | [report](examples/stripe-audit-report.md) |
| [**env-hardening**](skills/env-hardening) | "validate my env vars" | Maps every `process.env` read, flags secrets in `NEXT_PUBLIC_` and server variables used in client components, and drafts a Zod-validated `env.ts` plus a complete `.env.example`. | [report](examples/env-hardening-report.md) |
| [**ship-check**](skills/ship-check) | "is it ready to launch?" | Production-readiness review before launch or client handover: hidden build errors, error and 404 pages, SEO and sharing, env docs, error tracking, migrations and backups, legal pages, email DNS, and the launch-day checks only you can confirm. | [report](examples/ship-check-report.md) |
| [**agent-rules**](skills/agent-rules) | "write an AGENTS.md for this project" | Inspects your project and writes an `AGENTS.md` (plus a `CLAUDE.md` that imports it) with your real stack, commands, structure and security rules — merging any existing `.cursorrules` or agent files. | [AGENTS.md](examples/agent-rules-AGENTS.md) |

## Install

Requires Node.js 22.20+ for the installer; the scanners run on Node 18+.

```bash
npx skills add kitwright-ai/skills                               # choose skills and agents
npx skills add kitwright-ai/skills --skill security-audit        # just one skill
npx skills add kitwright-ai/skills --skill stripe-audit -a claude-code
npx skills add kitwright-ai/skills -g                            # for all your projects
```

[`skills`](https://github.com/vercel-labs/skills) installs to Claude Code (`.claude/skills/`),
Cursor and Codex (`.agents/skills/`) and many other agents. Only the skill folders under
[`skills/`](skills) are installed — instructions, scanner and license. Test fixtures stay here.

Prefer not to use the installer? Copy a folder from [`skills/`](skills) into your agent's skills
folder (e.g. `.claude/skills/security-audit/`).

## Use the scanners directly

Every skill ships a read-only scanner you can run without an agent — locally or in CI:

```bash
node skills/security-audit/scripts/audit.mjs path/to/app --fail-on high
node skills/stripe-audit/scripts/audit.mjs path/to/app --out stripe-report.md
node skills/env-hardening/scripts/scan.mjs path/to/app --json
node skills/ship-check/scripts/check.mjs path/to/app --fail-on fail
node skills/agent-rules/scripts/inspect.mjs path/to/app
```

No dependencies. Secrets are masked in every report, and env file values are never printed.

## How the skills work

1. The scanner finds candidates with static checks — fast, but heuristic.
2. Your agent verifies each one by reading the code, dismisses false positives, and checks what
   static analysis can't (authorization logic, payment flows, launch settings).
3. You get a Markdown report with why each issue matters and how to fix it, and the agent offers
   fixes — applying them only when you confirm.

A clean report is not a guarantee. These skills catch the common mistakes; they don't replace a
review of your business logic.

## Development

```bash
npm ci
npm test
```

Each skill has its fixtures in [`fixtures/<skill>/`](fixtures) and its tests in
[`test/<skill>.test.mjs`](test).

## More from Kitwright

These skills check the rules that [Kitwright](https://kitwright.ai) kits enforce by design: every
route and action behind an auth wrapper, tenant-scoped queries, verified idempotent webhooks,
secrets validated at startup, rate limits and security headers — plus the `AGENTS.md`, skills and
commands that keep your coding agent inside them. See [kitwright.ai](https://kitwright.ai).

MIT © Kitwright
