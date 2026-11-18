import { isGitIgnored } from "./files.mjs";
import { BUILTIN, LIBRARY_READ, looksSecret, sideOf, TOOLING } from "./names.mjs";

export const SEVERITIES = ["high", "medium", "low"];

/**
 * @typedef {{
 *   check: string; severity: "high" | "medium" | "low"; title: string; name?: string;
 *   file?: string; line?: number; snippet?: string; why: string; fix: string;
 * }} Problem
 */

const READ_FORMS = new Set(["dot", "bracket", "destructure", "env-import"]);
const SUPPRESS = /env-hardening-ignore(?:\s*:)?\s*([\w,\s-]*)/;

/** `// env-hardening-ignore [check]` on the line or the line above. */
function isSuppressed(file, line, check) {
  if (!file) return false;
  for (const l of [line, line - 1]) {
    const match = SUPPRESS.exec(file.lines[l - 1] ?? "");
    if (!match) continue;
    const ids = (match[1] ?? "").split(/[\s,]+/).filter((id) => /^[a-z][\w-]+$/.test(id));
    if (ids.length === 0 || ids.includes(check)) return true;
  }
  return false;
}

/** Masks long tokens that mix letters and digits (keys), keeping the first 6 characters. */
export function maskSecrets(text) {
  return text.replace(/[A-Za-z0-9_\-+/=]{16,}/g, (token) =>
    /\d/.test(token) && /[A-Za-z]/.test(token) ? `${token.slice(0, 6)}…` : token,
  );
}

// `process.env.X || "literal"` and `{ X = "literal" } = process.env` (group 2 is the quote).
const ENV_DEFAULT =
  /(process\.env(?:\.\w+|\[\s*["'`]\w+["'`]\s*\])\s*\)?\s*(?:\|\||\?\?)\s*)(["'`])(?:(?!\2)[^\\]|\\.)*\2/g;
const DESTRUCTURE_DEFAULT = /(\b[A-Z][A-Z0-9_]*\s*=\s*)(["'`])(?:(?!\2)[^\\]|\\.)*\2/g;

/** Replaces hard-coded defaults of secret-looking variables with "…". */
export function maskSecretDefaults(text) {
  const mask = (match, prefix, quote) => {
    const name = /([A-Z][A-Z0-9_]*)\W*$/.exec(prefix.replace(/\s*(\|\||\?\?|=)\s*$/, ""));
    return name && looksSecret(name[1]) ? `${prefix}${quote}…${quote}` : match;
  };
  return text.replace(ENV_DEFAULT, mask).replace(DESTRUCTURE_DEFAULT, mask);
}

function snippetOf(file, line) {
  let text = (file?.lines[line - 1] ?? "").trim();
  if (!text) return undefined;
  if (text.length > 160) text = `${text.slice(0, 157)}...`;
  return maskSecrets(maskSecretDefaults(text));
}

/**
 * @param {{
 *   root: string;
 *   sources: Map<string, import("./files.mjs").SourceFile>;
 *   envFiles: import("./files.mjs").EnvFile[];
 *   variables: Map<string, any>;
 *   usages: import("./usages.mjs").Usage[];
 *   dynamic: import("./usages.mjs").DynamicAccess[];
 *   envModules: { file: string; kind: string }[];
 *   examples: import("./files.mjs").EnvFile[];
 * }} ctx
 * @returns {Problem[]}
 */
export function checkProblems(ctx) {
  /** @type {Problem[]} */
  const problems = [];
  const add = (problem) => {
    const file = problem.file ? ctx.sources.get(problem.file) : undefined;
    if (file && problem.line && isSuppressed(file, problem.line, problem.check)) return;
    const snippet = file && problem.line ? snippetOf(file, problem.line) : undefined;
    problems.push({ ...problem, ...(snippet ? { snippet } : {}) });
  };
  const firstCodeUsage = (v) => v.usages.find((u) => u.form !== "next-config-env") ?? v.usages[0];
  const hasModule = ctx.envModules.length > 0;

  for (const v of ctx.variables.values()) {
    // 1. Secret-looking names exposed to the browser.
    if (v.side === "client" && looksSecret(v.name)) {
      const at = firstCodeUsage(v) ?? v.definedIn[0];
      const bare = v.name.slice("NEXT_PUBLIC_".length);
      add({
        check: "public-secret-name",
        severity: "high",
        name: v.name,
        title: `Secret-looking variable \`${v.name}\` is exposed to the browser`,
        file: at?.file,
        line: at?.line,
        why: "Every NEXT_PUBLIC_ value is inlined into the JavaScript bundle at build time and readable by anyone who opens the site.",
        fix: `Rename it to \`${bare}\`, read it only in server code (route handlers, server actions, server components) and **rotate the key** if it was ever deployed: it must be considered leaked.`,
      });
    }

    // 2. Used in code but not documented in .env.example.
    const flaggedPublic = v.side === "client" && looksSecret(v.name);
    if (v.readInCode && !v.inExample && !flaggedPublic && !BUILTIN.test(v.name)) {
      if (ctx.examples.length > 0) {
        const at = firstCodeUsage(v);
        add({
          check: "missing-from-example",
          severity: "medium",
          name: v.name,
          title: `\`${v.name}\` is used in code but missing from .env.example`,
          file: at?.file,
          line: at?.line,
          why: "Whoever deploys or clones the app has no way to know the variable exists until something crashes in production.",
          fix: `Add \`${v.name}=\` (no value) to .env.example, or run the scanner with \`--emit-example\`.`,
        });
      }
    }

    // 3. Documented in .env.example but never read.
    if (v.inExample && !v.readInCode && !LIBRARY_READ.test(v.name) && !TOOLING.test(v.name)) {
      const at = v.definedIn.find((d) => d.template);
      add({
        check: "unused-in-example",
        severity: "low",
        name: v.name,
        title: `\`${v.name}\` is in .env.example but never used`,
        file: at?.file,
        line: at?.line,
        why: "Stale entries make people configure (and share) credentials the app does not need.",
        fix: "Remove it from .env.example, unless a library reads it implicitly (check its docs first).",
      });
    }
  }

  for (const u of ctx.usages) {
    const side = sideOf(u.name);

    // 4. Server-only variables read in client components.
    if (u.context === "client" && side === "server" && READ_FORMS.has(u.form)) {
      const viaEnv = u.form === "env-import";
      add({
        check: "server-var-in-client",
        severity: looksSecret(u.name) ? "high" : "medium",
        name: u.name,
        title: `Client component reads server-only variable \`${u.name}\``,
        file: u.file,
        line: u.line,
        why: viaEnv
          ? "Server variables are not available in the browser; with the env.ts guard this read throws at runtime."
          : 'Client components run in the browser, where server variables are `undefined` (the code silently breaks) or, if someone "fixes" it with NEXT_PUBLIC_ or next.config `env`, the secret leaks.',
        fix: "Move the code that needs it to a server component, server action or route handler and pass only the result to the client.",
      });
    }

    // 5. NEXT_PUBLIC_ variables that Next.js cannot inline.
    if (u.context === "client" && side === "client" && u.form === "destructure") {
      add({
        check: "client-var-not-inlined",
        severity: "medium",
        name: u.name,
        title: `\`${u.name}\` is destructured from process.env in a client component`,
        file: u.file,
        line: u.line,
        why: "Next.js only replaces the literal `process.env.NEXT_PUBLIC_X` at build time; destructured values are `undefined` in the browser.",
        fix: `Read it as \`env.${u.name}\` from env.ts (whose client map uses \`process.env.${u.name}\` literally).`,
      });
    }

    // 6. Secrets inlined through next.config `env`.
    if (u.form === "next-config-env" && looksSecret(u.name)) {
      add({
        check: "next-config-env-secret",
        severity: "high",
        name: u.name,
        title: `\`${u.name}\` is inlined into the client bundle by next.config \`env\``,
        file: u.file,
        line: u.line,
        why: "Values listed in next.config `env` are replaced at build time everywhere, client components included, so the secret ships to every visitor.",
        fix: "Remove it from `env` in next.config, read it on the server through env.ts, and **rotate it** if this config was ever deployed.",
      });
    }

    // 7. Fallback defaults that hide a missing variable.
    if (u.fallback && u.context !== "env-module" && !BUILTIN.test(u.name)) {
      const secret = looksSecret(u.name);
      add({
        check: "fallback-default",
        severity: secret ? "high" : "medium",
        name: u.name,
        title: secret
          ? `Secret \`${u.name}\` falls back to a hard-coded default`
          : `\`${u.name}\` falls back to a default when it is missing`,
        file: u.file,
        line: u.line,
        why: secret
          ? "If the variable is missing in production the app keeps running with a value anyone can read in the source, so sessions, tokens or signatures can be forged."
          : "A missing variable goes unnoticed: production silently runs with a development value instead of failing at startup.",
        fix: secret
          ? "Make it required in env.ts (no default) so a missing value fails at startup, and never commit a usable default secret."
          : "Make it required in env.ts, or declare the default explicitly there with `.default(...)` if it is really optional.",
      });
    }

    // 8. Reads that bypass an existing env module.
    if (
      hasModule &&
      ["dot", "bracket", "destructure"].includes(u.form) &&
      !["env-module", "next-config"].includes(u.context) &&
      u.name !== "NODE_ENV" &&
      !TOOLING.test(u.name)
    ) {
      add({
        check: "direct-env-read",
        severity: "low",
        name: u.name,
        title: `\`${u.name}\` is read from process.env instead of env.ts`,
        file: u.file,
        line: u.line,
        why: "Reads outside the validated module skip validation and typing, and are where secrets slip into client code.",
        fix: `Add it to env.ts if needed and use \`env.${u.name}\`.`,
      });
    }
  }

  // 9. Dynamic access in client code is never inlined.
  for (const d of ctx.dynamic) {
    if (d.context !== "client") continue;
    add({
      check: "dynamic-env-access",
      severity: "medium",
      title: "Dynamic process.env access in a client component",
      file: d.file,
      line: d.line,
      why: "`process.env[name]` and `...process.env` are not inlined by Next.js, so they are empty in the browser, and they cannot be checked statically.",
      fix: "Read each variable explicitly through env.ts.",
    });
  }

  // 10. Env files that would be committed.
  for (const f of ctx.envFiles) {
    if (f.template || isGitIgnored(ctx.root, f.path)) continue;
    add({
      check: "env-file-not-ignored",
      severity: "high",
      title: `\`${f.path}\` is not git-ignored`,
      file: f.path,
      why: "Env files hold real credentials; once committed they stay in git history for everyone with repo access.",
      fix: "Add `.env*` and `!.env.example` to .gitignore. If the file was ever committed, remove it with `git rm --cached` and rotate every secret in it.",
    });
  }

  // 11. Project-level gaps.
  const readNames = [...ctx.variables.values()].filter(
    (v) => v.readInCode && !BUILTIN.test(v.name) && !TOOLING.test(v.name),
  );
  if (readNames.length > 0 && ctx.examples.length === 0) {
    add({
      check: "no-env-example",
      severity: "medium",
      title: `No .env.example: ${readNames.length} variable(s) are undocumented`,
      why: "Without a template nobody knows which variables to set, and real `.env` files get shared instead.",
      fix: "Create .env.example with every name and no values (`--emit-example .env.example`).",
    });
  }
  if (readNames.length > 0 && !hasModule) {
    const files = new Set(ctx.usages.filter((u) => READ_FORMS.has(u.form)).map((u) => u.file));
    add({
      check: "no-env-validation",
      severity: "medium",
      title: `No env validation: ${readNames.length} variable(s) read directly in ${files.size} file(s)`,
      why: "A missing or malformed variable is only discovered when the code that reads it runs, often as a crash or a silent `undefined` in production.",
      fix: "Create env.ts from the draft below so every variable is validated once at startup, then replace `process.env.X` with `env.X`.",
    });
  }

  return problems.sort(
    (a, b) =>
      SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}
