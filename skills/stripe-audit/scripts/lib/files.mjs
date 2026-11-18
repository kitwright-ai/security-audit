import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  ".output",
  "dist",
  "build",
  "out",
  "coverage",
  "playwright-report",
  "test-results",
]);

const TEXT_EXTENSIONS = /\.(m?[jt]sx?|cjs|json)$/i;
const ENV_FILE_NAME = /^\.env(\..+)?$/;
const MAX_BYTES = 1_000_000;

/**
 * @typedef {{ path: string; abs: string; content: string; lines: string[] }} SourceFile
 */

/** All source and env files under `root`, with POSIX-style relative paths. */
export function collectFiles(root) {
  /** @type {SourceFile[]} */
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!TEXT_EXTENSIONS.test(entry.name) && !ENV_FILE_NAME.test(entry.name)) continue;
      if (/package-lock\.json$|\.lock\.json$/.test(entry.name)) continue;
      try {
        if (statSync(abs).size > MAX_BYTES) continue;
        const content = readFileSync(abs, "utf8");
        files.push({
          path: relative(root, abs).split(sep).join("/"),
          abs,
          content,
          lines: content.split(/\r?\n/),
        });
      } catch {
        // unreadable file: skip
      }
    }
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** 1-based line number of a character index. */
export function lineAt(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Text from the bracket at `openIndex` to its matching closing bracket (`{}` or `()`),
 * skipping strings and comments well enough for typical app code.
 */
export function blockFrom(content, openIndex) {
  const open = content[openIndex];
  const close = open === "(" ? ")" : open === "[" ? "]" : "}";
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];
    const prev = content[i - 1];
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (ch === "/" && content[i + 1] === "/") {
      i = content.indexOf("\n", i);
      if (i === -1) break;
      continue;
    }
    if (ch === "/" && content[i + 1] === "*") {
      i = content.indexOf("*/", i + 2);
      if (i === -1) break;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return content.slice(openIndex, i + 1);
    }
  }
  return content.slice(openIndex);
}

export const ENV_FILE = /(^|\/)\.env(\.[^/]+)?$/;
export const ENV_TEMPLATE = /\.(example|sample|template|dist|defaults)$/;

export const isEnvFile = (path) => ENV_FILE.test(path);

export const isTestFile = (path) =>
  /(^|\/)(__tests__|tests?|e2e|fixtures|__mocks__|mocks)\//.test(path) ||
  /\.(test|spec)\.[mc]?[jt]sx?$/.test(path);

/** Source files worth analysing: code, not tests, not env or JSON files. */
export const isSourceFile = (path) => /\.[mc]?[jt]sx?$/.test(path) && !isTestFile(path);

export const isClientFile = (file) =>
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(file.content);

export const isServerActionFile = (file) =>
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(file.content);

/** Next.js App Router route handlers and Pages Router API routes. */
export const isRouteFile = (path) =>
  /(^|\/)app\/(.+\/)?route\.[mc]?[jt]sx?$/.test(path) ||
  /(^|\/)pages\/api\/.+\.[mc]?[jt]sx?$/.test(path);

export const isPagesApiRoute = (path) => /(^|\/)pages\/api\/.+\.[mc]?[jt]sx?$/.test(path);

/** App Router pages and Pages Router pages (not API routes or `_app`/`_document`). */
export const isPageFile = (path) =>
  /(^|\/)app\/(.+\/)?page\.[mc]?[jt]sx?$/.test(path) ||
  (/(^|\/)pages\/.+\.[mc]?[jt]sx?$/.test(path) &&
    !isPagesApiRoute(path) &&
    !/(^|\/)pages\/_/.test(path));

/** URL-ish path of a route file, e.g. `app/api/webhooks/stripe/route.ts` → `/api/webhooks/stripe`. */
export function routePath(path) {
  const app = /(?:^|\/)app\/(.*?)\/?route\.[mc]?[jt]sx?$/.exec(path);
  if (app) return `/${(app[1] ?? "").replace(/\([^)]*\)\/?/g, "")}`.replace(/\/$/, "") || "/";
  const pages = /(?:^|\/)pages\/(api\/.+)\.[mc]?[jt]sx?$/.exec(path);
  return pages ? `/${pages[1]}`.replace(/\/index$/, "") : path;
}

const RESOLVE_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

/**
 * Local files imported by `file` (relative imports and the `@/` / `~/` aliases).
 * Package imports are not followed.
 * @param {SourceFile} file
 * @param {Map<string, SourceFile>} byPath
 */
export function localImports(file, byPath) {
  const found = [];
  const specifiers = file.content.matchAll(
    /(?:import\s[^;]*?from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g,
  );
  for (const [, spec] of specifiers) {
    let base;
    if (spec.startsWith(".")) base = join(dirname(file.path), spec);
    else if (/^[@~]\//.test(spec)) base = spec.slice(2);
    else continue;
    const candidates = spec.startsWith(".") ? [base] : [base, `src/${base}`];
    for (const candidate of candidates) {
      const normalized = candidate.split(sep).join("/");
      const hit = RESOLVE_EXTENSIONS.map((ext) => byPath.get(normalized + ext)).find(Boolean);
      if (hit) {
        if (hit !== file && !found.includes(hit)) found.push(hit);
        break;
      }
    }
  }
  return found;
}
