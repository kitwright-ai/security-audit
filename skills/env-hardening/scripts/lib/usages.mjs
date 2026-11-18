import { fileContext, isNextConfig, lineAt } from "./files.mjs";

/**
 * @typedef {"dot" | "bracket" | "destructure" | "next-config-env" | "schema" | "env-import" | "prisma"} UsageForm
 * @typedef {{
 *   name: string; file: string; line: number; form: UsageForm; context: string;
 *   fallback?: "string" | "number" | "other"; comparedToBoolean?: boolean;
 * }} Usage
 * @typedef {{ file: string; line: number; context: string }} DynamicAccess
 */

const NAME = "[A-Za-z_][A-Za-z0-9_]*";

/** Replaces comments with spaces so indexes and line numbers stay valid. */
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
}

/** Text between the `{` at `openIndex` and its matching `}`. */
function blockFrom(content, openIndex) {
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      if (ch === quote && content[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return content.slice(openIndex, i + 1);
  }
  return content.slice(openIndex);
}

function fallbackAfter(text) {
  const match = /^\s*\)?\s*(?:\|\||\?\?)\s*(["'`]|-?\d|\S)/.exec(text);
  if (!match) return undefined;
  if (/["'`]/.test(match[1])) return "string";
  if (/[-\d]/.test(match[1])) return "number";
  // `process.env.A || process.env.B` chains are not hard-coded defaults.
  return /^\s*\)?\s*(?:\|\||\?\?)\s*process\.env/.test(text) ? undefined : "other";
}

const comparedToBoolean = (text) => /^\s*[!=]==?\s*["'`](?:true|false|1|0)["'`]/.test(text);

/**
 * Kind of environment-validation module this file is, or null.
 * @param {import("./files.mjs").SourceFile} file
 */
export function envModuleKind(file) {
  const c = file.content;
  if (/["']@t3-oss\/env-(?:nextjs|core)["']/.test(c)) return "t3-env";
  if (/\b(?:safeParse|parse)\s*\(\s*process\.env\s*\)/.test(c)) return "zod";
  const envNamed = /(^|\/)(env(\.[a-z]+)?|env\/(index|server|client))\.[mc]?[jt]s$/.test(file.path);
  if (!envNamed || !/process\.env/.test(c)) return null;
  if (/from\s+["']zod["']|require\(\s*["']zod["']\s*\)/.test(c)) return "zod";
  if (/\bcreateEnv\s*\(/.test(c)) return "createEnv";
  return null;
}

/**
 * Every env variable read in one source file.
 * @param {import("./files.mjs").SourceFile} file
 * @param {{ isEnvModule: boolean; hasEnvModule: boolean }} options
 * @returns {{ usages: Usage[]; dynamic: DynamicAccess[] }}
 */
export function extractUsages(file, options) {
  /** @type {Usage[]} */
  const usages = [];
  /** @type {DynamicAccess[]} */
  const dynamic = [];
  const context = options.isEnvModule ? "env-module" : fileContext(file);

  if (file.path.endsWith(".prisma")) {
    for (const m of file.content.matchAll(new RegExp(`\\benv\\(\\s*"(${NAME})"\\s*\\)`, "g"))) {
      usages.push({
        name: m[1],
        file: file.path,
        line: lineAt(file.content, m.index),
        form: "prisma",
        context: "server",
      });
    }
    return { usages, dynamic };
  }

  const code = stripComments(file.content);
  const add = (name, index, form, extra = {}) =>
    usages.push({
      name,
      file: file.path,
      line: lineAt(code, index),
      form,
      context,
      ...extra,
    });

  // process.env.NAME
  for (const m of code.matchAll(new RegExp(`\\bprocess\\.env\\.(${NAME})`, "g"))) {
    const after = code.slice(m.index + m[0].length, m.index + m[0].length + 200);
    if (/^\s*=[^=]/.test(after)) continue; // assignment, not a read
    const fallback = fallbackAfter(after);
    add(m[1], m.index, "dot", {
      ...(fallback ? { fallback } : {}),
      ...(comparedToBoolean(after) ? { comparedToBoolean: true } : {}),
    });
  }

  // process.env["NAME"] and process.env[expression]
  for (const m of code.matchAll(/\bprocess\.env\s*\[\s*([^\]]*)\]/g)) {
    const literal = new RegExp(`^(["'\`])(${NAME})\\1\\s*$`).exec(m[1].trim());
    if (!literal) {
      dynamic.push({ file: file.path, line: lineAt(code, m.index), context });
      continue;
    }
    const after = code.slice(m.index + m[0].length, m.index + m[0].length + 200);
    if (/^\s*=[^=]/.test(after)) continue;
    const fallback = fallbackAfter(after);
    add(literal[2], m.index, "bracket", {
      ...(fallback ? { fallback } : {}),
      ...(comparedToBoolean(after) ? { comparedToBoolean: true } : {}),
    });
  }

  // const { A, B: b, C = "x", ...rest } = process.env
  for (const m of code.matchAll(
    /\b(?:const|let|var)\s*\{([^{}]*)\}\s*(?::[^=]+)?=\s*process\.env\b(?!\s*[.[])/g,
  )) {
    const inner = m[1];
    const innerStart = m.index + m[0].indexOf("{") + 1;
    let offset = 0;
    for (const part of inner.split(",")) {
      const partIndex = innerStart + offset + (part.length - part.trimStart().length);
      offset += part.length + 1;
      const text = part.trim();
      if (!text) continue;
      if (text.startsWith("...")) {
        dynamic.push({ file: file.path, line: lineAt(code, partIndex), context });
        continue;
      }
      const prop = new RegExp(`^(${NAME})\\s*(?::\\s*[\\w$]+)?\\s*(?:=\\s*([\\s\\S]+))?$`).exec(
        text,
      );
      if (!prop) continue;
      const def = prop[2]?.trim();
      const fallback = !def
        ? undefined
        : /^["'`]/.test(def)
          ? "string"
          : /^-?\d/.test(def)
            ? "number"
            : "other";
      add(prop[1], partIndex, "destructure", fallback ? { fallback } : {});
    }
  }

  // next.config `env: { NAME: ... }` (inlined at build time, client bundle included)
  if (isNextConfig(file.path)) {
    const env = /\benv\s*:\s*\{/.exec(code);
    if (env) {
      const open = env.index + env[0].length - 1;
      const block = blockFrom(code, open);
      for (const k of block.matchAll(new RegExp(`(?:^|[{,\\s])["']?(${NAME})["']?\\s*:`, "g"))) {
        add(k[1], open + k.index + k[0].indexOf(k[1]), "next-config-env");
      }
    }
  }

  // Keys declared in an env validation module (schemas and runtimeEnv maps).
  if (options.isEnvModule) {
    for (const k of code.matchAll(/^[ \t]*["']?([A-Z][A-Z0-9_]*)["']?\s*:/gm)) {
      add(k[1], k.index + k[0].indexOf(k[1]), "schema");
    }
  } else if (options.hasEnvModule && /import\s*\{[^}]*\benv\b[^}]*\}\s*from/.test(code)) {
    for (const m of code.matchAll(/(?<![.\w$])env\.([A-Z][A-Z0-9_]*)\b/g)) {
      add(m[1], m.index, "env-import");
    }
  }

  // One entry per name/line/form.
  const seen = new Set();
  return {
    usages: usages.filter((u) => {
      const key = `${u.name}:${u.line}:${u.form}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    dynamic,
  };
}
