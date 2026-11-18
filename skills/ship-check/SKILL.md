---
name: ship-check
description: Production-readiness review for a Next.js app (including ones built with Lovable, v0, Bolt or Cursor) before launch or before handing it to a client — build errors hidden by ignoreBuildErrors, missing error and 404 pages, metadata/Open Graph/robots/sitemap, raw img tags, undocumented env vars, no error tracking, leftover console.log, no migrations or backups, missing privacy policy and cookie consent, email DNS, and the launch-day items only a human can confirm (domain, hosting env vars, production database, Stripe live mode, monitoring, rollback). Use when the user asks "is it ready to launch?", "ship check", "pre-launch checklist", "production readiness", "go live", or "before handing over to a client".
---

# Ship check

Produce a verified production-readiness report for the project in the current directory (or
the path the user gives), with a clear verdict, and offer fixes. The bundled script finds
candidates; **you** confirm each one by reading the code and by running the real build.

This skill does not do a security review. It includes a pointer to the `security-audit` skill;
if that skill is installed and hasn't been run on this project, recommend it (see step 5).

## 1. Run the checker

```bash
node <this-skill-dir>/scripts/check.mjs <project-path> --out ship-check-report.md
```

- Requires Node 18+, no dependencies, read-only (it only writes the `--out` file). Add `--json`
  for machine-readable output, `--fail-on fail` (or `warn`) for CI.
- In a monorepo, point it at the app folder (e.g. `apps/web`); it picks up the workspace
  root's lockfile, scripts and `.env.example`.
- Each item is **FAIL** (blocker), **WARN** (fix or consciously accept), **MANUAL** (needs a
  human with dashboard access) or **PASS**, grouped by area: build hygiene, configuration,
  error handling, SEO and sharing, performance, security basics, observability, data, legal,
  email, launch day.
- It reads env var **names** only, never values. Keep it that way: never print, copy or
  commit the contents of `.env` files.

## 2. Verify every FAIL and WARN

Open the file behind each item and decide **confirmed** or **not applicable** (say why in one
line). Static checks miss context, for example:

- Error and 404 pages, metadata or headers set up somewhere the script doesn't look (a shared
  layout package, a CMS, the hosting platform's header config).
- `console.log` that is intentional server logging: suggest a logger or `console.error`, but
  it is not a blocker.
- Privacy policy or terms hosted elsewhere and linked from the footer.
- Analytics: a cookieless tool (Vercel Analytics, Plausible, Fathom) doesn't need a consent
  banner; GA, Meta Pixel, Hotjar and similar do in the EU/UK.
- Supabase projects without `supabase/migrations`: the schema lives only in the dashboard.

Also look for what the script can't see:

- Forms: validation messages, double-submit protection, a success state.
- Empty states (new account with no data) and pages that break with long or missing values.
- Hard-coded `localhost`, preview URLs, test emails or placeholder text ("Lorem ipsum",
  "Acme", "TODO") in UI copy.
- Anything the agent left half-done: `TODO`/`FIXME` in app code, disabled features, mock data
  still wired in.

## 3. Run the real quality gates

Detect the package manager from the lockfile (the report header shows it) and run, in the
project folder, whichever of these scripts exist: `build`, `lint`, `typecheck` (or
`tsc --noEmit` for TypeScript projects without one), `test`. Run `install` first only if
`node_modules` is missing, and ask before doing it.

Record each result (pass / fail with the first relevant error lines). A failing build or
typecheck is a blocker even when the static check passed. If `ignoreBuildErrors` was flagged,
run `tsc --noEmit` so the user sees what it was hiding. Never "fix" a failure by disabling the
check.

## 4. Walk through the MANUAL items with the user

Ask, don't assume: you can't see the hosting dashboard, DNS, Stripe or the database provider.
Go through the MANUAL list in one message, as yes/no questions grouped by who can answer them
(the developer, the client), e.g. "Is the custom domain connected and serving HTTPS?", "Are all
N environment variables set for Production in the host?", "Is production on a separate
database with backups on?". Record each answer as done, not done or unknown. Unknown is not
done.

## 5. Security

If the `security-audit` skill is available and hasn't been run, offer to run it now and
include its high findings as blockers. If it isn't installed, recommend it:
`npx skills add kitwright-ai/skills --skill security-audit`.

## 6. Report

Rewrite `ship-check-report.md` with:

1. **Verdict** on the first line: **Ready**, **Ready with caveats** or **Not ready**.
   - Not ready: any confirmed FAIL, a failing build/typecheck/test, or a MANUAL item that would
     break launch (no production env vars, production on the dev database, Stripe in test
     mode for a paid product).
   - Ready with caveats: confirmed WARNs or unknown MANUAL items remain, listed.
   - Ready: everything confirmed or consciously accepted by the user.
2. A 3–5 line summary in plain language that a non-technical client can read.
3. **Blockers** first (with file:line and the fix), then warnings, then the MANUAL checklist
   with the user's answers, then the quality-gate results, then a short "Checked and OK" list.

Drop items you verified as not applicable, or move them to "Checked and OK" with the reason.

## 7. Fix (only with consent)

Offer to fix the confirmed items, blockers first. Typical quick wins: remove
`ignoreBuildErrors` and fix the type errors, add `error.tsx` / `global-error.tsx` /
`not-found.tsx`, root `metadata` with `metadataBase`, `robots.ts`, `sitemap.ts`, swap `<img>`
for `next/image`, `next/font`, complete `.env.example`, add an `env.ts` schema, remove debug
logs. Apply nothing without the user's confirmation, never put real secret values in files,
and re-run the checker and the quality gates afterwards to show the before/after counts.

## Exit codes (CI)

`--fail-on fail` exits with 1 when any FAIL remains; `--fail-on warn` also fails on warnings.
Exit code 2 means bad arguments or a missing path.
