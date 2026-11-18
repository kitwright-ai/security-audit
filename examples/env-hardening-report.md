# Env hardening report

- **Project:** messy-app
- **Generated:** 2026-11-18T13:02:37.293Z
- **Files scanned:** 9 (Next.js)
- **Variables read in code:** 13 (8 server, 5 client, 0 shared)
- **Validation module:** none found
- **zod:** not installed (`npm install zod`)

| Severity | Problems |
| --- | --- |
| 🔴 HIGH | 7 |
| 🟠 MEDIUM | 14 |
| 🟡 LOW | 1 |

> Static checks find likely problems; confirm each one in the code. Values from `.env` files are never read into this report: only variable names.

## Problems

### 🔴 HIGH — `.env.local` is not git-ignored

`.env.local`

**Why it matters:** Env files hold real credentials; once committed they stay in git history for everyone with repo access.

**Fix:** Add `.env*` and `!.env.example` to .gitignore. If the file was ever committed, remove it with `git rm --cached` and rotate every secret in it.

<sub>check: `env-file-not-ignored`</sub>

### 🔴 HIGH — Secret-looking variable `NEXT_PUBLIC_STRIPE_SECRET_KEY` is exposed to the browser

`components/Checkout.tsx:7`

```
const secret = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;
```

**Why it matters:** Every NEXT_PUBLIC_ value is inlined into the JavaScript bundle at build time and readable by anyone who opens the site.

**Fix:** Rename it to `STRIPE_SECRET_KEY`, read it only in server code (route handlers, server actions, server components) and **rotate the key** if it was ever deployed: it must be considered leaked.

<sub>check: `public-secret-name`</sub>

### 🔴 HIGH — Client component reads server-only variable `STRIPE_SECRET_KEY`

`components/Checkout.tsx:8`

```
const serverKey = process.env.STRIPE_SECRET_KEY;
```

**Why it matters:** Client components run in the browser, where server variables are `undefined` (the code silently breaks) or, if someone "fixes" it with NEXT_PUBLIC_ or next.config `env`, the secret leaks.

**Fix:** Move the code that needs it to a server component, server action or route handler and pass only the result to the client.

<sub>check: `server-var-in-client`</sub>

### 🔴 HIGH — Secret `DATABASE_URL` falls back to a hard-coded default

`lib/db.ts:1`

```
export const databaseUrl = process.env.DATABASE_URL || "…";
```

**Why it matters:** If the variable is missing in production the app keeps running with a value anyone can read in the source, so sessions, tokens or signatures can be forged.

**Fix:** Make it required in env.ts (no default) so a missing value fails at startup, and never commit a usable default secret.

<sub>check: `fallback-default`</sub>

### 🔴 HIGH — Secret `STRIPE_WEBHOOK_SECRET` falls back to a hard-coded default

`lib/stripe.ts:5`

```
export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "…";
```

**Why it matters:** If the variable is missing in production the app keeps running with a value anyone can read in the source, so sessions, tokens or signatures can be forged.

**Fix:** Make it required in env.ts (no default) so a missing value fails at startup, and never commit a usable default secret.

<sub>check: `fallback-default`</sub>

### 🔴 HIGH — Secret `SESSION_SECRET` falls back to a hard-coded default

`middleware.ts:3`

```
const secret = process.env.SESSION_SECRET || "…";
```

**Why it matters:** If the variable is missing in production the app keeps running with a value anyone can read in the source, so sessions, tokens or signatures can be forged.

**Fix:** Make it required in env.ts (no default) so a missing value fails at startup, and never commit a usable default secret.

<sub>check: `fallback-default`</sub>

### 🔴 HIGH — `STRIPE_SECRET_KEY` is inlined into the client bundle by next.config `env`

`next.config.js:4`

```
STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
```

**Why it matters:** Values listed in next.config `env` are replaced at build time everywhere, client components included, so the secret ships to every visitor.

**Fix:** Remove it from `env` in next.config, read it on the server through env.ts, and **rotate it** if this config was ever deployed.

<sub>check: `next-config-env-secret`</sub>

### 🟠 MEDIUM — No env validation: 13 variable(s) read directly in 8 file(s)

**Why it matters:** A missing or malformed variable is only discovered when the code that reads it runs, often as a crash or a silent `undefined` in production.

**Fix:** Create env.ts from the draft below so every variable is validated once at startup, then replace `process.env.X` with `env.X`.

<sub>check: `no-env-validation`</sub>

### 🟠 MEDIUM — `FEATURE_BETA` is used in code but missing from .env.example

`app/api/flags/route.ts:2`

```
return Response.json({ beta: process.env.FEATURE_BETA === "true" });
```

**Why it matters:** Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.

**Fix:** Add `FEATURE_BETA=` (no value) to .env.example, or run the scanner with `--emit-example`.

<sub>check: `missing-from-example`</sub>

### 🟠 MEDIUM — `NEXT_PUBLIC_APP_URL` is destructured from process.env in a client component

`components/Checkout.tsx:3`

```
const { NEXT_PUBLIC_APP_URL } = process.env;
```

**Why it matters:** Next.js only replaces the literal `process.env.NEXT_PUBLIC_X` at build time; destructured values are `undefined` in the browser.

**Fix:** Read it as `env.NEXT_PUBLIC_APP_URL` from env.ts (whose client map uses `process.env.NEXT_PUBLIC_APP_URL` literally).

<sub>check: `client-var-not-inlined`</sub>

### 🟠 MEDIUM — `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is used in code but missing from .env.example

`components/Checkout.tsx:6`

```
const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
```

**Why it matters:** Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.

**Fix:** Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=` (no value) to .env.example, or run the scanner with `--emit-example`.

<sub>check: `missing-from-example`</sub>

### 🟠 MEDIUM — `STRIPE_SECRET_KEY` is used in code but missing from .env.example

`components/Checkout.tsx:8`

```
const serverKey = process.env.STRIPE_SECRET_KEY;
```

**Why it matters:** Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.

**Fix:** Add `STRIPE_SECRET_KEY=` (no value) to .env.example, or run the scanner with `--emit-example`.

<sub>check: `missing-from-example`</sub>

### 🟠 MEDIUM — Dynamic process.env access in a client component

`components/Flags.tsx:4`

```
return <span>{process.env[`NEXT_PUBLIC_FLAG_${name}`]}</span>;
```

**Why it matters:** `process.env[name]` and `...process.env` are not inlined by Next.js, so they are empty in the browser, and they cannot be checked statically.

**Fix:** Read each variable explicitly through env.ts.

<sub>check: `dynamic-env-access`</sub>

### 🟠 MEDIUM — `OPENAI_API_KEY` is used in code but missing from .env.example

`lib/config.ts:1`

```
const { OPENAI_API_KEY, SMTP_PORT = "587", SUPPORT_EMAIL } = process.env;
```

**Why it matters:** Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.

**Fix:** Add `OPENAI_API_KEY=` (no value) to .env.example, or run the scanner with `--emit-example`.

<sub>check: `missing-from-example`</sub>

### 🟠 MEDIUM — `SMTP_PORT` is used in code but missing from .env.example

`lib/config.ts:1`

```
const { OPENAI_API_KEY, SMTP_PORT = "587", SUPPORT_EMAIL } = process.env;
```

**Why it matters:** Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.

**Fix:** Add `SMTP_PORT=` (no value) to .env.example, or run the scanner with `--emit-example`.

<sub>check: `missing-from-example`</sub>

### 🟠 MEDIUM — `SUPPORT_EMAIL` is used in code but missing from .env.example

`lib/config.ts:1`

```
const { OPENAI_API_KEY, SMTP_PORT = "587", SUPPORT_EMAIL } = process.env;
```

**Why it matters:** Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.

**Fix:** Add `SUPPORT_EMAIL=` (no value) to .env.example, or run the scanner with `--emit-example`.

<sub>check: `missing-from-example`</sub>

### 🟠 MEDIUM — `SMTP_PORT` falls back to a default when it is missing

`lib/config.ts:1`

```
const { OPENAI_API_KEY, SMTP_PORT = "587", SUPPORT_EMAIL } = process.env;
```

**Why it matters:** A missing variable goes unnoticed: production silently runs with a development value instead of failing at startup.

**Fix:** Make it required in env.ts, or declare the default explicitly there with `.default(...)` if it is really optional.

<sub>check: `fallback-default`</sub>

### 🟠 MEDIUM — `STRIPE_WEBHOOK_SECRET` is used in code but missing from .env.example

`lib/stripe.ts:5`

```
export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "…";
```

**Why it matters:** Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.

**Fix:** Add `STRIPE_WEBHOOK_SECRET=` (no value) to .env.example, or run the scanner with `--emit-example`.

<sub>check: `missing-from-example`</sub>

### 🟠 MEDIUM — `NEXT_PUBLIC_SUPABASE_URL` is used in code but missing from .env.example

`lib/supabase.ts:4`

```
process.env.NEXT_PUBLIC_SUPABASE_URL as string,
```

**Why it matters:** Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.

**Fix:** Add `NEXT_PUBLIC_SUPABASE_URL=` (no value) to .env.example, or run the scanner with `--emit-example`.

<sub>check: `missing-from-example`</sub>

### 🟠 MEDIUM — `NEXT_PUBLIC_SUPABASE_ANON_KEY` is used in code but missing from .env.example

`lib/supabase.ts:5`

```
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
```

**Why it matters:** Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.

**Fix:** Add `NEXT_PUBLIC_SUPABASE_ANON_KEY=` (no value) to .env.example, or run the scanner with `--emit-example`.

<sub>check: `missing-from-example`</sub>

### 🟠 MEDIUM — `SESSION_SECRET` is used in code but missing from .env.example

`middleware.ts:3`

```
const secret = process.env.SESSION_SECRET || "…";
```

**Why it matters:** Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.

**Fix:** Add `SESSION_SECRET=` (no value) to .env.example, or run the scanner with `--emit-example`.

<sub>check: `missing-from-example`</sub>

### 🟡 LOW — `LEGACY_API_URL` is in .env.example but never used

`.env.example:3`

**Why it matters:** Stale entries make people configure (and share) credentials the app does not need.

**Fix:** Remove it from .env.example, unless a library reads it implicitly (check its docs first).

<sub>check: `unused-in-example`</sub>

## Variables

| Variable | Side | Read in | .env.example | Locations |
| --- | --- | --- | --- | --- |
| `APP_NAME` | server | next-config | no | `next.config.js:5` |
| `DATABASE_URL` | server | server | yes | `lib/db.ts:1` |
| `FEATURE_BETA` | server | server | no | `app/api/flags/route.ts:2` |
| `LEGACY_API_URL` | server | — | yes | only in .env.example |
| `NEXT_PUBLIC_APP_URL` | client (browser) | client, server | yes | `components/Checkout.tsx:3`, `lib/config.ts:7` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client (browser) | client | no | `components/Checkout.tsx:6` |
| `NEXT_PUBLIC_STRIPE_SECRET_KEY` | client (browser) | client | no | `components/Checkout.tsx:7` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client (browser) | server | no | `lib/supabase.ts:5` |
| `NEXT_PUBLIC_SUPABASE_URL` | client (browser) | server | no | `lib/supabase.ts:4` |
| `OPENAI_API_KEY` | server | server | no | `lib/config.ts:1` |
| `SESSION_SECRET` | server | middleware | no | `middleware.ts:3` |
| `SMTP_PORT` | server | server | no | `lib/config.ts:1` |
| `STRIPE_SECRET_KEY` | server | client, server, next-config | no | `components/Checkout.tsx:8`, `lib/stripe.ts:4`, `next.config.js:4` |
| `STRIPE_WEBHOOK_SECRET` | server | server | no | `lib/stripe.ts:5` |
| `SUPPORT_EMAIL` | server | server | no | `lib/config.ts:1` |

## Public by design

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Publishable keys (Stripe `pk_...`) are meant for the browser. Make sure the value really is the publishable key, not the secret one.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase's anon key is public by design: it is meant for the browser and only grants what your row level security policies allow. Keep RLS enabled on every table and never expose the service_role key.

## Draft `env.ts`

Generated from the names above with conservative types. Review every schema against how the variable is used before adopting it.

- NEXT_PUBLIC_STRIPE_SECRET_KEY looks like a secret: moved to the server schema as STRIPE_SECRET_KEY. Rotate it if it was ever deployed.

```ts
// env.ts: the only module that reads process.env. Import `env` from here everywhere else.
// Drafted by the env-hardening skill: review every schema against how the variable is used.
import { z } from "zod";

// Server-only variables. Reading one of these in the browser throws.
const server = {
  DATABASE_URL: z.string().url(), // lib/db.ts:1 · had a fallback in code: keep it required or add .default()
  FEATURE_BETA: z.enum(["true", "false"]), // app/api/flags/route.ts:2
  OPENAI_API_KEY: z.string().min(1), // lib/config.ts:1
  SESSION_SECRET: z.string().min(1), // middleware.ts:3 · had a fallback in code: keep it required or add .default()
  SMTP_PORT: z.coerce.number().int().positive(), // lib/config.ts:1 · had a fallback in code: keep it required or add .default()
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"), // components/Checkout.tsx:8 (+2) · read in a client component: move that code to the server
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"), // lib/stripe.ts:5 · had a fallback in code: keep it required or add .default()
  SUPPORT_EMAIL: z.string().email(), // lib/config.ts:1
};

// Variables exposed to the browser. Names must start with NEXT_PUBLIC_ and must never be secrets.
const client = {
  NEXT_PUBLIC_APP_URL: z.string().url(), // components/Checkout.tsx:3 (+1)
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"), // components/Checkout.tsx:6
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1), // lib/supabase.ts:5
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(), // lib/supabase.ts:4
};

// Variables Next.js sets on both sides (e.g. NODE_ENV).
const shared = {
  // none found
};

// Next.js only inlines NEXT_PUBLIC_ (and NODE_ENV) values into the browser bundle when they are
// written out literally as `process.env.NAME`. Keep one line per client/shared variable here.
const clientRuntimeEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
};

const serverSchema = z.object({ ...server, ...client, ...shared });
const clientSchema = z.object({ ...client, ...shared });

export type Env = z.infer<typeof serverSchema>;

const isServer = !("document" in globalThis);

function createEnv(): Env {
  // Escape hatch for tooling that runs without real variables (lint, Docker image build).
  // Never set it at runtime.
  if (process.env.SKIP_ENV_VALIDATION === "1") return process.env as unknown as Env;

  const runtimeEnv: Record<string, string | undefined> = isServer
    ? { ...process.env, ...clientRuntimeEnv }
    : clientRuntimeEnv;
  const parsed = (isServer ? serverSchema : clientSchema).safeParse(runtimeEnv);

  if (!parsed.success) {
    // Names only: never include values in errors or logs.
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    const lines = names.map(
      (name) => `  - ${name}: ${runtimeEnv[name] === undefined ? "is missing" : "is invalid"}`,
    );
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}\nSee .env.example.`);
  }

  return new Proxy(parsed.data, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (!isServer && prop in server) {
        throw new Error(`Server-only environment variable "${prop}" was read in the browser`);
      }
      return Reflect.get(target, prop);
    },
  }) as Env;
}

export const env = createEnv();
```

## Draft `.env.example` additions

```dotenv
# Added by env-hardening. Names only: put real values in .env.local, never here.

# Server only
FEATURE_BETA=
OPENAI_API_KEY=
SESSION_SECRET=
SMTP_PORT=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SUPPORT_EMAIL=

# Exposed to the browser (never put secrets here)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_URL=
```

