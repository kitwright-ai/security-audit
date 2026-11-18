---
name: env-hardening
description: Turn scattered process.env reads in a Next.js app (including ones built with Lovable, v0, Bolt or Cursor) into one Zod-validated env.ts, keep secrets out of NEXT_PUBLIC_ and the browser bundle, and keep .env.example complete. Use when the user asks to "validate env vars", create or fix an "env.ts", says "process.env is undefined in production" or in a client component, finds secrets in NEXT_PUBLIC_ variables, wants to "set up .env.example", or the app crashes (or silently misbehaves) because of a missing or wrong environment variable.
---

# Env hardening

Move the project to a single validated `env.ts` so a missing variable fails at startup with a
clear message instead of crashing in production, secrets never reach the browser, and
`.env.example` lists every variable. The bundled scanner finds every read and drafts the file;
**you** confirm each problem in the code and adjust the draft to how each variable is used.

**Never print, copy, log or commit secret values.** Work with variable names only. Don't open
`.env`, `.env.local` or `.env.production` to read values; the scanner only extracts their names.

## 1. Run the scanner

```bash
node <this-skill-dir>/scripts/scan.mjs <project-path> --out env-hardening-report.md
```

- Node 18+, no dependencies, read-only unless you pass an output flag. `--json` gives
  machine-readable output; `--fail-on high|medium|low` exits 1 for CI.
- It lists every variable read (`process.env.X`, `process.env["X"]`,
  `const { A, B } = process.env`, next.config `env`, Prisma `env("X")`) with `file:line`, whether
  it is client (`NEXT_PUBLIC_`) or server, and where it is read (server, client component,
  middleware/edge, next.config).
- Problems it flags: secret-looking `NEXT_PUBLIC_` names, server variables read in
  `"use client"` files, secrets inlined through next.config `env`, `||`/`??` defaults that hide
  a missing variable, names missing from or stale in `.env.example`, env files that are not
  git-ignored, `NEXT_PUBLIC_` values destructured or read dynamically in client code (never
  inlined), and the absence of a validation module.
- The report ends with a draft `env.ts` and the `.env.example` lines that are missing.

If the report says a validation module already exists (`env.ts`, `@t3-oss/env-nextjs`, a Zod
schema over `process.env`), extend that module instead of creating a second one.

## 2. Review each problem in the code

Open every flagged location and decide whether it is real. Things to settle while reading:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public by design
  (the anon key only grants what row level security allows). They are not problems, but check
  that RLS is on and the value really is the publishable/anon key.
- A server variable read in a client component means the feature is broken today (`undefined`
  in the browser) or someone is about to "fix" it by leaking the secret. Plan to move that code
  to a server component, server action or route handler.
- For each fallback default, ask whether the variable is truly optional. Secrets never are.
  Non-secrets that really are optional get `.default(...)` in `env.ts`, not `||` in the code.
- Check whether a stale `.env.example` entry is read implicitly by a library (Auth.js, Prisma,
  Sentry) before suggesting removal.

## 3. Make sure Zod is installed

Check `package.json`. If `zod` is missing, offer to add it with the project's package manager
(the report names it, e.g. `pnpm add zod`) and wait for consent.

## 4. Create env.ts from the draft

Write it to `src/env.ts` if the project has `src/`, otherwise `env.ts` at the root (the report
shows the suggested path). Either copy the draft from the report or generate it:

```bash
node <this-skill-dir>/scripts/scan.mjs <project-path> --emit-env src/env.ts
```

It refuses to overwrite an existing file unless you add `--force`. Then adjust the types by
reading how each variable is used. The draft is conservative (`z.string().min(1)` unless the name
or usage says otherwise: URLs, `sk_`/`whsec_`/`pk_` prefixes, emails, ports with
`z.coerce.number()`, `"true"`/`"false"` flags, `NODE_ENV` as an enum). With Zod 4 you may switch
`z.string().url()` / `.email()` to `z.url()` / `z.email()`.

Keep these properties of the template:

- `server` holds server-only variables, `client` only `NEXT_PUBLIC_` ones that are not secrets.
- `clientRuntimeEnv` must reference every client variable **literally** as
  `process.env.NEXT_PUBLIC_X`. Next.js inlines `NEXT_PUBLIC_` values into the browser bundle by
  textual replacement at build time; destructuring, `process.env[name]` or spreading
  `process.env` is not replaced and is `undefined` in the browser.
- Validation errors list variable **names** only, never values.
- The proxy throws if server code reads a server variable in the browser, instead of silently
  returning `undefined`.

## 5. Replace process.env reads

- In server code, replace `process.env.X` with `env.X` imported from `env.ts`, and remove the
  `||`/`??` fallbacks you decided against in step 2.
- In client components, use `env.NEXT_PUBLIC_X`. Move any logic that needs a server variable to
  the server and pass only the result down.
- `env.ts` becomes the only module that reads `process.env`. `NODE_ENV` checks may stay as they
  are.

## 6. Validate at startup

Import the module early so a bad configuration fails on boot (and in `next build`), not on the
first request that happens to read the variable:

- `next.config.ts`: `import "./src/env";` at the top (in `.mjs` configs, load it from
  `instrumentation.ts` instead).
- or `instrumentation.ts`: `export async function register() { await import("./src/env"); }`.

`SKIP_ENV_VALIDATION=1` skips validation for tooling that runs without real variables (lint, a
Docker image build). Never set it at runtime.

## 7. Move secrets out of NEXT_PUBLIC_ and rotate them

For each secret-looking `NEXT_PUBLIC_` variable or secret inlined through next.config `env`:
rename it without the prefix (or remove it from `env`), read it only on the server, and tell the
user plainly: **if this was ever deployed, the value is public: rotate it** in the provider's
dashboard. Renaming does not un-leak it. The user also has to rename the variable in their
hosting provider (Vercel, etc.), since you can't see or change those values.

## 8. Update .env.example

Add every missing name with an empty value, grouped server/client, or let the scanner append
them:

```bash
node <this-skill-dir>/scripts/scan.mjs <project-path> --emit-example .env.example
```

It writes names only and refuses to touch real env files (`.env`, `.env.local`). Make sure
`.gitignore` covers `.env*` with `!.env.example`. If an env file was ever committed, tell the user
to remove it with `git rm --cached` and rotate everything in it.

## 9. Verify and summarise

Run the project's typecheck and build (e.g. `pnpm typecheck && pnpm build`), then re-run the
scanner and show the before/after problem counts. Summarise for the user: the variables now
validated, what moved from client to server, which secrets to rotate, the `.env.example` names
added, and anything they still have to change in their hosting provider.
