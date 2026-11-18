import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  ".output",
  ".claude",
  ".agents",
  ".cursor",
  "dist",
  "build",
  "out",
  "coverage",
  "playwright-report",
  "test-results",
]);

const SOURCE_EXTENSIONS = /\.(m?[jt]sx?|c[jt]s|prisma)$/i;
export const ENV_FILE = /^\.env(\..+)?$/;
export const ENV_TEMPLATE = /\.(example|sample|template|dist|defaults)$/;
const MAX_BYTES = 1_000_000;

/**
 * @typedef {{ path: string; content: string; lines: string[] }} SourceFile
 * @typedef {{ path: string; template: boolean; names: { name: string; line: number }[] }} EnvFile
 */

/**
 * Variable names declared in a dotenv file. Values are discarded right here and never leave
 * this function.
 */
export function parseEnvNames(content) {
  const names = [];
  content.split(/\r?\n/).forEach((text, i) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(text);
    if (match) names.push({ name: match[1], line: i + 1 });
  });
  return names;
}

/**
 * Source files and env files under `root`, with POSIX-style relative paths.
 * Env files are reduced to their variable names: their values are never kept in memory.
 */
export function collectFiles(root) {
  /** @type {SourceFile[]} */
  const sources = [];
  /** @type {EnvFile[]} */
  const envFiles = [];
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
      const isEnv = ENV_FILE.test(entry.name);
      if (!isEnv && !SOURCE_EXTENSIONS.test(entry.name)) continue;
      try {
        if (statSync(abs).size > MAX_BYTES) continue;
        const path = relative(root, abs).split(sep).join("/");
        const content = readFileSync(abs, "utf8");
        if (isEnv) {
          envFiles.push({
            path,
            template: ENV_TEMPLATE.test(entry.name),
            names: parseEnvNames(content),
          });
        } else {
          sources.push({ path, content, lines: content.split(/\r?\n/) });
        }
      } catch {
        // unreadable file: skip
      }
    }
  };
  walk(root);
  const byPath = (a, b) => a.path.localeCompare(b.path);
  return { sources: sources.sort(byPath), envFiles: envFiles.sort(byPath) };
}

/** 1-based line number of a character index. */
export function lineAt(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const isTestFile = (path) =>
  /(^|\/)(__tests__|tests?|e2e|fixtures|__mocks__|mocks)\//.test(path) ||
  /\.(test|spec)\.[mc]?[jt]sx?$/.test(path);

const DIRECTIVE = (name) =>
  new RegExp(`^\\s*(?:\\/\\/[^\\n]*\\n|\\/\\*[\\s\\S]*?\\*\\/\\s*)*["']use ${name}["']`);

export const isClientFile = (file) => DIRECTIVE("client").test(file.content);

export const isNextConfig = (path) => /(^|\/)next\.config\.[mc]?[jt]s$/.test(path);

/** Where a file runs: next-config, middleware/edge, client ("use client") or server. */
export function fileContext(file) {
  if (isNextConfig(file.path)) return "next-config";
  if (/(^|\/)(src\/)?(middleware|proxy)\.[mc]?[jt]s$/.test(file.path)) return "middleware";
  if (isClientFile(file)) return "client";
  if (/export\s+const\s+runtime\s*=\s*["']edge["']/.test(file.content)) return "edge";
  return "server";
}

// --- .gitignore (light check, no git binary needed) -------------------------------------------

// Converts a .gitignore glob to a RegExp: "**" + "/" (any dirs), "*", "?"; everything else literal.
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*" && glob[i + 2] === "/") {
      out += "(?:.*/)?";
      i += 2;
    } else if (ch === "*" && glob[i + 1] === "*") {
      out += ".*";
      i += 1;
    } else if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** Verdict of one .gitignore for `relPath` (relative to that file's dir): true, false or undefined. */
function matchesGitignore(file, relPath) {
  const name = relPath.split("/").pop() ?? relPath;
  const rules = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  let ignored;
  for (const rule of rules) {
    const negate = rule.startsWith("!");
    const pattern = (negate ? rule.slice(1) : rule).replace(/^\//, "").replace(/\/$/, "");
    const re = globToRegExp(pattern);
    if (re.test(name) || re.test(relPath)) ignored = !negate;
  }
  return ignored;
}

/**
 * True if a .gitignore in the project or a parent directory (up to the git root) ignores the
 * file. The nearest .gitignore with a matching rule wins.
 */
export function isGitIgnored(root, path) {
  let dir = join(root, dirname(path));
  const abs = join(root, path);
  for (;;) {
    const file = join(dir, ".gitignore");
    if (existsSync(file)) {
      const verdict = matchesGitignore(file, relative(dir, abs).split(sep).join("/"));
      if (verdict !== undefined) return verdict;
    }
    if (existsSync(join(dir, ".git"))) return false;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}
