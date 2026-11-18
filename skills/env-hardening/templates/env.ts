// env.ts: the only module that reads process.env. Import `env` from here everywhere else.
// Drafted by the env-hardening skill: review every schema against how the variable is used.
import { z } from "zod";

// Server-only variables. Reading one of these in the browser throws.
const server = {
  /* @server */
};

// Variables exposed to the browser. Names must start with NEXT_PUBLIC_ and must never be secrets.
const client = {
  /* @client */
};

// Variables Next.js sets on both sides (e.g. NODE_ENV).
const shared = {
  /* @shared */
};

// Next.js only inlines NEXT_PUBLIC_ (and NODE_ENV) values into the browser bundle when they are
// written out literally as `process.env.NAME`. Keep one line per client/shared variable here.
const clientRuntimeEnv = {
  /* @client-runtime */
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
