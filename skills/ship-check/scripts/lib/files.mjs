import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  ".output",
  ".netlify",
  "dist",
  "build",
  "out",
  "coverage",
  "playwright-report",
  "test-results",
]);

/** Files whose content is read. Env files are never read here (see `readEnvExampleNames`). */
const TEXT_EXTENSIONS = /\.(m?[jt]sx?|cjs|cts|json|sql|ya?ml|toml|prisma|css|scss|html|mdx)$/i;
const LOCKFILES =
  /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json)$/;
const MAX_BYTES = 1_000_000;

/**
 * @typedef {{ path: string; content: string; lines: string[] }} SourceFile
 * @typedef {{ path: string; size: number }} ProjectPath
 */

/**
 * Walks `root` once. Returns every file path with its size, and the content of text files
 * (outside `public/`, never env files, never lockfiles).
 * @returns {{ files: SourceFile[]; paths: ProjectPath[] }}
 */
export function collectProject(root) {
  /** @type {SourceFile[]} */
  const files = [];
  /** @type {ProjectPath[]} */
  const paths = [];
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
      const path = relative(root, abs).split(sep).join("/");
      let size = 0;
      try {
        size = statSync(abs).size;
      } catch {
        continue;
      }
      paths.push({ path, size });
      if (!TEXT_EXTENSIONS.test(entry.name) || LOCKFILES.test(entry.name)) continue;
      if (/^(src\/)?public\//.test(path) || size > MAX_BYTES) continue;
      try {
        const content = readFileSync(abs, "utf8");
        files.push({ path, content, lines: content.split(/\r?\n/) });
      } catch {
        // unreadable file: skip
      }
    }
  };
  walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  paths.sort((a, b) => a.path.localeCompare(b.path));
  return { files, paths };
}

/**
 * Variable names declared in an env example file. Only names are kept; values are discarded
 * immediately so they can never reach the report.
 */
export function readEnvExampleNames(abs) {
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m?.[1]) names.push(m[1]);
  }
  return names;
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
 * Replaces JS comments with spaces (newlines kept), so regexes don't match commented-out code
 * and indices still map to the original lines. String-aware enough for config files.
 */
export function stripComments(content) {
  let out = "";
  let quote = null;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += content[i + 1] ?? "";
        i++;
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && content[i + 1] === "/") {
      while (i < content.length && content[i] !== "\n") {
        out += " ";
        i++;
      }
      out += i < content.length ? "\n" : "";
      continue;
    }
    if (ch === "/" && content[i + 1] === "*") {
      const end = content.indexOf("*/", i + 2);
      const stop = end === -1 ? content.length : end + 2;
      for (; i < stop; i++) out += content[i] === "\n" ? "\n" : " ";
      i--;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Lighter comment removal for app code (JSX text breaks string tracking): blanks block comments
 * and whole-line `//` comments, keeping newlines.
 */
export function blankComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => " ".repeat(m.length));
}

export const isTestFile = (path) =>
  /(^|\/)(__tests__|tests?|e2e|fixtures|__mocks__|mocks|cypress|playwright)\//.test(path) ||
  /\.(test|spec|stories)\.[mc]?[jt]sx?$/.test(path);

export const isCodeFile = (path) => /\.[mc]?[jt]sx?$/.test(path);

/** Masks long tokens that mix letters and digits (keys), keeping the first 6 characters. */
export function maskSecrets(text) {
  return text
    .replace(/[A-Za-z0-9_\-+/=]{16,}/g, (token) =>
      /\d/.test(token) && /[A-Za-z]/.test(token) ? `${token.slice(0, 6)}…` : token,
    )
    .replace(/(:\/\/[^:/\s"'`]+:)[^@\s"'`]+@/g, "$1•••@");
}

/** Trimmed source line for display, secrets masked. */
export function snippet(file, line) {
  const text = (file.lines[line - 1] ?? "").trim();
  return maskSecrets(text.length > 160 ? `${text.slice(0, 157)}...` : text);
}

/** `{ file, line, snippet }` for a match index in a file. */
export function locate(file, index) {
  const line = lineAt(file.content, index);
  return { file: file.path, line, snippet: snippet(file, line) };
}
