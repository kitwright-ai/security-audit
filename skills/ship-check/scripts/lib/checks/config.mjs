import { blankComments, isCodeFile, isTestFile, locate } from "../files.mjs";
import { collector, withLocations } from "../items.mjs";

const ENV_REF =
  /process\.env\.([A-Z_][A-Z0-9_]*)|process\.env\[\s*["'`]([A-Z_][A-Z0-9_]*)["'`]\s*\]/g;

/** Set by Node, Next.js or the host: nobody has to configure them. */
const BUILT_IN =
  /^(NODE_ENV|NEXT_RUNTIME|NEXT_PHASE|CI|VERCEL|VERCEL_.+|NETLIFY|PORT|HOSTNAME|TZ)$/;

const VALIDATION =
  /@t3-oss\/env|\bcreateEnv\s*\(|\bcleanEnv\s*\(|\.(?:safeP|p)arse(?:Async)?\s*\(\s*process\.env\b|\bparseEnv\s*\(/;

const SECRET_LOOKING =
  /^NEXT_PUBLIC_\w*(SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|PASSWD|DATABASE_URL|DB_URL)/;

/**
 * Blanks the contents of string and template literals, so code samples shown as
 * text (docs, marketing pages) don't count as real validation.
 */
function blankStrings(source) {
  return source.replace(/`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
}

/** Every `process.env.NAME` in app code, with where it is first used. */
export function envReferences(ctx) {
  /** @type {Map<string, { file: string; line: number; snippet: string }>} */
  const refs = new Map();
  for (const file of ctx.files) {
    if (!isCodeFile(file.path) || isTestFile(file.path)) continue;
    for (const m of blankComments(file.content).matchAll(ENV_REF)) {
      const name = m[1] ?? m[2];
      if (!name || BUILT_IN.test(name) || refs.has(name)) continue;
      refs.set(name, locate(file, m.index));
    }
  }
  return refs;
}

/** @param {import("../project.mjs").Context} ctx */
export function checkConfig(ctx) {
  const { items, pass, fail, warn } = collector("config");
  const refs = envReferences(ctx);

  // 1. Env validation at startup.
  const validator = ctx.sourceFiles.find((f) => {
    const code = blankStrings(blankComments(f.content));
    return (
      VALIDATION.test(code) ||
      // env.ts that maps process.env values into a schema: `schema.parse({ A: process.env.A })`
      (/(^|\/)env(\.server|\.client)?\.[mc]?[jt]s$/.test(f.path) &&
        /\.(safeP|p)arse(Async)?\s*\(/.test(code) &&
        /process\.env/.test(code))
    );
  });
  if (validator) {
    pass("env-validation", `Environment variables are validated (\`${validator.path}\`)`);
  } else if (refs.size > 0) {
    warn("env-validation", "Environment variables are read without validation", {
      ...withLocations([...refs.values()].slice(0, 3)),
      why: "A missing or mistyped variable in the hosting dashboard then fails at runtime, on the first request that needs it, instead of failing the deploy with a clear message.",
      fix: "Add one `env.ts` that parses `process.env` with a schema (Zod or `@t3-oss/env-nextjs`) and import variables from it instead of reading `process.env` directly.",
    });
  }

  // 2. .env.example documents every variable.
  if (refs.size > 0) {
    if (!ctx.envExample) {
      fail("env-example", `No \`.env.example\`, but the code reads ${refs.size} variables`, {
        ...withLocations([...refs.values()]),
        why: "Whoever deploys the app (you in six months, the client, their next developer) has no list of what to set. Missing variables become production crashes.",
        fix: `Add a committed \`.env.example\` with every name and a placeholder value: ${[...refs.keys()].map((n) => `\`${n}\``).join(", ")}.`,
      });
    } else {
      const documented = new Set(ctx.envExampleNames);
      const missing = [...refs.entries()].filter(([name]) => !documented.has(name));
      if (missing.length === 0) {
        pass(
          "env-example",
          `\`${ctx.envExample}\` lists all ${refs.size} variables the code reads`,
        );
      } else {
        warn(
          "env-example",
          `\`${ctx.envExample}\` is missing ${missing.length} variable${missing.length === 1 ? "" : "s"}: ${missing.map(([n]) => `\`${n}\``).join(", ")}`,
          {
            ...withLocations(missing.map(([, loc]) => loc)),
            why: "Undocumented variables are the ones that get forgotten when the app is deployed to a new environment or handed over.",
            fix: `Add the missing names to \`${ctx.envExample}\` with placeholder values (never real ones).`,
          },
        );
      }
    }
  }

  // 3. NEXT_PUBLIC_ names that look like secrets (details belong to security-audit).
  const publicSecrets = [...new Set([...refs.keys(), ...ctx.envExampleNames])].filter((n) =>
    SECRET_LOOKING.test(n),
  );
  if (publicSecrets.length > 0) {
    warn(
      "public-env-secret",
      `Secret-looking variable${publicSecrets.length === 1 ? "" : "s"} exposed to the browser: ${publicSecrets.map((n) => `\`${n}\``).join(", ")}`,
      {
        ...withLocations(publicSecrets.flatMap((n) => (refs.has(n) ? [refs.get(n)] : []))),
        why: "`NEXT_PUBLIC_` variables are inlined into the JavaScript every visitor downloads.",
        fix: "Run the security-audit skill: it checks client exposure in depth. Usually: drop the prefix, read the value only on the server, and rotate the key.",
      },
    );
  }
  return items;
}
