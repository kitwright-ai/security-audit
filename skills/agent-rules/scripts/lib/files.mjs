import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

/** Directories that never contain project conventions worth describing. */
export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  ".output",
  ".cache",
  ".pnpm-store",
  ".yarn",
  "dist",
  "build",
  "out",
  "coverage",
  "playwright-report",
  "test-results",
  "storybook-static",
]);

const SOURCE_EXTENSIONS = /\.(m?[jt]sx?|cjs|cts)$/i;
const MAX_BYTES = 500_000;
const MAX_FILES = 5_000;

/** POSIX-style path of `abs` relative to `root`. */
export const rel = (root, abs) => relative(root, abs).split(sep).join("/");

/** Reads a UTF-8 file, or returns `undefined` when it is missing or unreadable. */
export function readText(abs) {
  try {
    if (statSync(abs).size > MAX_BYTES) return undefined;
    return readFileSync(abs, "utf8");
  } catch {
    return undefined;
  }
}

/** Parses JSON or JSONC (comments and trailing commas, as tsconfig allows). */
export function parseJsonc(text) {
  if (text === undefined) return undefined;
  let out = "";
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i++;
      } else if (ch === '"') {
        quote = false;
      }
      continue;
    }
    if (ch === '"') {
      quote = true;
      out += ch;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end - 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    out += ch;
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return undefined;
  }
}

/** Immediate entries of a directory, or `[]`. */
export function listDir(abs) {
  try {
    return readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * @typedef {{ path: string; abs: string; content: string }} SourceFile
 */

/** JS/TS source files under `root` (skipping build output and dependencies). */
export function collectSources(root) {
  /** @type {SourceFile[]} */
  const files = [];
  const walk = (dir) => {
    for (const entry of listDir(dir)) {
      if (files.length >= MAX_FILES) return;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(abs);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.test(entry.name)) continue;
      if (/\.d\.[mc]?ts$/.test(entry.name)) continue;
      const content = readText(abs);
      if (content !== undefined) files.push({ path: rel(root, abs), abs, content });
    }
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Every path (files and directories) under `root` whose relative path matches `test`. */
export function findPaths(root, test, { maxDepth = 6 } = {}) {
  /** @type {string[]} */
  const found = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    for (const entry of listDir(dir)) {
      const abs = join(dir, entry.name);
      const path = rel(root, abs);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (test(path, true)) found.push(`${path}/`);
        walk(abs, depth + 1);
      } else if (entry.isFile() && test(path, false)) {
        found.push(path);
      }
    }
  };
  walk(root, 0);
  return found.sort();
}

/** `root` and its ancestors, stopping after a directory that contains `.git`. */
export function ancestors(root, maxLevels = 6) {
  const dirs = [];
  let dir = root;
  for (let i = 0; i <= maxLevels; i++) {
    dirs.push(dir);
    if (existsSync(join(dir, ".git"))) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirs;
}

/** True when the source starts with the given directive (after comments). */
export const hasDirective = (content, directive) =>
  new RegExp(`^\\s*(?:\\/\\/[^\\n]*\\n\\s*|\\/\\*[\\s\\S]*?\\*\\/\\s*)*["']${directive}["']`).test(
    content,
  );

/** Next.js App Router route handlers and Pages Router API routes. */
export const isRouteFile = (path) =>
  /(^|\/)app\/(.+\/)?route\.[mc]?[jt]sx?$/.test(path) ||
  /(^|\/)pages\/api\/.+\.[mc]?[jt]sx?$/.test(path);

export const isTestFile = (path) =>
  /(^|\/)(__tests__|e2e)\//.test(path) || /\.(test|spec)\.[mc]?[jt]sx?$/.test(path);
