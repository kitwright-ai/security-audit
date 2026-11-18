import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BUILTIN, CLIENT_PREFIX, looksSecret, TOOLING } from "./names.mjs";

const TEMPLATE = fileURLToPath(new URL("../../templates/env.ts", import.meta.url));

/**
 * Conservative Zod schema for a variable, from its name and how the code uses it.
 * Anything not recognised is `z.string().min(1)` (required, non-empty).
 */
export function inferSchema(name, usages = []) {
  if (name === "NODE_ENV")
    return 'z.enum(["development", "test", "production"]).default("development")';
  if (BUILTIN.test(name)) return "z.string().optional()";
  if (/(^|_)PORT$/.test(name)) return "z.coerce.number().int().positive()";
  if (usages.some((u) => u.comparedToBoolean)) return 'z.enum(["true", "false"])';
  if (/STRIPE_(SECRET_)?KEY$/.test(name) && !/PUBLISHABLE/.test(name)) {
    return 'z.string().startsWith("sk_")';
  }
  if (/STRIPE_RESTRICTED_KEY$/.test(name)) return 'z.string().startsWith("rk_")';
  if (/STRIPE_WEBHOOK_SECRET$/.test(name)) return 'z.string().startsWith("whsec_")';
  if (/STRIPE_PUBLISHABLE_KEY$/.test(name)) return 'z.string().startsWith("pk_")';
  if (/RESEND_API_KEY$/.test(name)) return 'z.string().startsWith("re_")';
  if (/(_URL|_URI)$|^URL$/.test(name)) return "z.string().url()";
  if (/_EMAIL$/.test(name)) return "z.string().email()";
  return "z.string().min(1)";
}

const location = (v) => {
  const code = v.usages.filter((u) => u.form !== "next-config-env");
  const first = code[0];
  if (!first) return "";
  return ` // ${first.file}:${first.line}${code.length > 1 ? ` (+${code.length - 1})` : ""}`;
};

/**
 * Plan of which variable goes where. Secret-looking NEXT_PUBLIC_ names are moved to the
 * server schema without the prefix.
 * @param {Map<string, any>} variables
 */
export function planSchema(variables) {
  const server = new Map();
  const client = new Map();
  const shared = new Map();
  const notes = [];

  for (const v of [...variables.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!v.readInCode || TOOLING.test(v.name)) continue;
    if (v.side === "shared") {
      shared.set(v.name, { schema: inferSchema(v.name, v.usages), comment: location(v) });
      continue;
    }
    if (v.side === "client" && looksSecret(v.name)) {
      const bare = v.name.slice(CLIENT_PREFIX.length);
      notes.push(
        `${v.name} looks like a secret: moved to the server schema as ${bare}. Rotate it if it was ever deployed.`,
      );
      if (!server.has(bare) && !variables.get(bare)?.readInCode) {
        server.set(bare, {
          schema: inferSchema(bare, v.usages),
          comment: ` // was ${v.name}: keep it server-only`,
        });
      }
      continue;
    }
    const target = v.side === "client" ? client : server;
    let comment = location(v);
    if (v.usages.some((u) => u.fallback && u.context !== "env-module")) {
      comment += " · had a fallback in code: keep it required or add .default()";
    }
    if (v.side === "server" && v.usages.some((u) => u.context === "client")) {
      comment += " · read in a client component: move that code to the server";
    }
    target.set(v.name, { schema: inferSchema(v.name, v.usages), comment });
  }
  return { server, client, shared, notes };
}

const entries = (map, indent = "  ") =>
  [...map].map(([name, { schema, comment }]) => `${indent}${name}: ${schema},${comment}`);

/** Draft env.ts: the template with the project's names and inferred schemas filled in. */
export function renderEnvTs(plan) {
  const runtime = [...plan.client.keys(), ...plan.shared.keys()].map(
    (name) => `  ${name}: process.env.${name},`,
  );
  const fill = (lines) => (lines.length > 0 ? lines.join("\n") : "  // none found");
  return readFileSync(TEMPLATE, "utf8")
    .replace(/^ {2}\/\* @server \*\/$/m, () => fill(entries(plan.server)))
    .replace(/^ {2}\/\* @client \*\/$/m, () => fill(entries(plan.client)))
    .replace(/^ {2}\/\* @shared \*\/$/m, () => fill(entries(plan.shared)))
    .replace(/^ {2}\/\* @client-runtime \*\/$/m, () => fill(runtime));
}

/**
 * `.env.example` lines for the variables in the plan that are not documented yet.
 * Names only: values are always empty.
 */
export function renderEnvExample(plan, documented) {
  const missing = (map) =>
    [...map.keys()].filter((n) => !documented.has(n) && !BUILTIN.test(n) && !TOOLING.test(n));
  const server = missing(plan.server);
  const client = missing(plan.client);
  if (server.length === 0 && client.length === 0) return "";
  const out = ["# Added by env-hardening. Names only: put real values in .env.local, never here."];
  if (server.length > 0) out.push("", "# Server only", ...server.map((n) => `${n}=`));
  if (client.length > 0) {
    out.push(
      "",
      "# Exposed to the browser (never put secrets here)",
      ...client.map((n) => `${n}=`),
    );
  }
  return `${out.join("\n")}\n`;
}
