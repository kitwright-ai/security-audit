---
name: security-audit
description: Audit a Next.js app (including ones built with Lovable, v0, Bolt or Cursor) for the security problems AI-built apps usually ship with — leaked secrets, NEXT_PUBLIC_ keys, routes and server actions without auth, queries without tenant/user filters (IDOR), unverified webhooks, missing rate limiting and security headers, and Supabase tables without row level security. Use when the user asks for a security review, audit, "is my app safe", before launch, or before handing a project to a client.
---

# Security audit

Produce a verified security report for the project in the current directory (or the path the
user gives) and offer fixes. The bundled script finds candidates; **you** confirm each one by
reading the code, because static checks have false positives and blind spots.

## 1. Run the scanner

```bash
node <this-skill-dir>/scripts/audit.mjs <project-path> --out security-audit-report.md
```

- Requires Node 18+, no dependencies, read-only. Add `--json` for machine-readable output.
- It covers: secrets in the repo or exposed to the client, route handlers and server actions
  without authentication, queries without an organization/user filter, webhooks without
  signature verification, public endpoints without rate limiting, missing security headers,
  and Supabase tables without RLS or with `using (true)` policies.

## 2. Verify every finding

For each finding, open the file and decide:

- **Confirmed** — explain the concrete attack in one sentence ("any logged-in user can delete
  another company's invoice by changing the id in the URL").
- **False positive** — explain why (e.g. auth happens in middleware for that path, the table is
  a global catalog). Suggest the matching `// security-audit-ignore <check> <reason>` comment so
  the next run is clean, but don't add it without the user's consent.

Things the scanner can't see that you must check while reading:

- Authentication done in `middleware.ts`/`proxy.ts` — confirm the matcher really covers the route.
- Authorization, not just authentication: can a `member` do what only an `admin` should?
- IDOR through dynamic segments (`[id]`) and `searchParams`, even when a filter exists.
- Mass assignment: passing `request.json()` or `formData` straight into `insert`/`update`.
- Input validation (Zod or similar) on every server action and route handler.
- SSRF: `fetch()` to a URL that comes from user input.
- File uploads: type/size limits, storage bucket policies (Supabase Storage policies too).
- `dangerouslySetInnerHTML`, `eval`, raw SQL built with string concatenation.
- Cookies/sessions: `httpOnly`, `secure`, `sameSite`; CORS `*` with credentials.
- Supabase: RLS policies that check `auth.uid()` but not organization membership; the
  `service_role` key used anywhere reachable from the browser.
- Dependencies: run the package manager's audit (`npm audit`, `pnpm audit`) and include highs.

If the project uses Supabase and no migrations are in the repo, ask the user to run
`select tablename from pg_tables where schemaname = 'public' and not rowsecurity;` in the SQL
editor and paste the result.

## 3. Report

Rewrite `security-audit-report.md` with only verified issues, ordered by severity, each with:
location, what an attacker can do, and the fix (code). Keep a short "Checked and OK" section so
the user sees what was covered. Lead with a 3–5 line summary in plain language for
non-technical readers.

## 4. Fix (only with consent)

Offer to fix the confirmed issues, highest severity first. When fixing:

- Never print, log or commit secret values. If a secret was committed, tell the user to
  **rotate it** — removing it from the code is not enough.
- Prefer one shared helper (auth + permission + validation) over repeating checks per route.
- Re-run the scanner after fixing and show the before/after counts.

## Exit codes (CI)

`--fail-on high|medium|low` exits with 1 when any finding at or above that severity remains.
