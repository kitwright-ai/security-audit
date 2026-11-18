import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  collectProject,
  isCodeFile,
  isTestFile,
  readEnvExampleNames,
  stripComments,
} from "./files.mjs";

const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
];

const ENV_EXAMPLES = [".env.example", ".env.sample", ".env.template", ".env.defaults"];

const readJson = (abs) => {
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return undefined;
  }
};

/** Glob (`apps/*`, `packages/**`) to an anchored regex over POSIX paths. */
const globToRegex = (glob) =>
  new RegExp(
    `^${glob
      .replace(/^\.\//, "")
      .replace(/\/$/, "")
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "GLOBSTAR")
      .replace(/\*/g, "[^/]+")
      .replace(/GLOBSTAR/g, ".*")}$`,
  );

/** Workspace globs declared in a directory (pnpm-workspace.yaml or package.json workspaces). */
function workspaceGlobs(dir) {
  const globs = [];
  const yaml = join(dir, "pnpm-workspace.yaml");
  if (existsSync(yaml)) {
    const text = readFileSync(yaml, "utf8");
    const block = /^packages:\s*\n((?:[ \t]+-.*\n?|[ \t]*#.*\n?|\s*\n)*)/m.exec(text);
    for (const m of (block?.[1] ?? "").matchAll(/^[ \t]+-\s*["']?([^"'#\n]+?)["']?\s*$/gm)) {
      if (m[1] && !m[1].startsWith("!")) globs.push(m[1]);
    }
  }
  const pkg = readJson(join(dir, "package.json"));
  const ws = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages;
  if (Array.isArray(ws)) globs.push(...ws.filter((g) => typeof g === "string"));
  return globs;
}

/** The monorepo root whose workspace globs include `root`, if any (stops at the git root). */
function findWorkspaceRoot(root) {
  let dir = root;
  while (!existsSync(join(dir, ".git"))) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
    const rel = relative(dir, root).split(sep).join("/");
    if (workspaceGlobs(dir).some((g) => globToRegex(g).test(rel))) return dir;
  }
  return undefined;
}

/** Lockfile in the project, else in its workspace root (monorepos). */
function findLockfile(root, workspaceRoot, pkg) {
  for (const dir of [root, workspaceRoot].filter(Boolean)) {
    for (const [name, manager] of LOCKFILES) {
      if (existsSync(join(dir, name))) {
        const rel = relative(root, join(dir, name)).split(sep).join("/");
        return { lockfile: rel, packageManager: manager };
      }
    }
  }
  const declared = /^(pnpm|npm|yarn|bun)@/.exec(pkg.packageManager ?? "");
  return { lockfile: undefined, packageManager: declared?.[1] ?? "npm" };
}

/**
 * `compilerOptions.strict` following relative `extends` (tsconfig allows comments, so this is
 * regex-based). `value` is undefined when it can't be determined (e.g. extends a package).
 */
function tsStrict(abs, depth = 0) {
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return { value: undefined };
  }
  const own = /"strict"\s*:\s*(true|false)/.exec(text);
  if (own) return { value: own[1] === "true", abs, index: own.index };
  const ext = /"extends"\s*:\s*(\[[^\]]*\]|"[^"]+")/.exec(text);
  if (!ext || depth > 5) return { value: false, abs };
  const parents = [...(ext[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "").reverse();
  for (const parent of parents) {
    if (!parent.startsWith(".")) return { value: undefined };
    const target = resolve(dirname(abs), parent.endsWith(".json") ? parent : `${parent}.json`);
    const result = tsStrict(target, depth + 1);
    if (result.value !== false || result.index !== undefined) return result;
  }
  return { value: false, abs };
}

/**
 * Everything the checks need, computed once.
 * @param {string} rootInput
 */
export function buildContext(rootInput) {
  const root = resolve(rootInput);
  if (!existsSync(root)) throw new Error(`Path not found: ${rootInput}`);
  const { files, paths } = collectProject(root);
  const pkg = readJson(join(root, "package.json")) ?? {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const workspaceRoot = findWorkspaceRoot(root);
  const workspacePkg = workspaceRoot ? (readJson(join(workspaceRoot, "package.json")) ?? {}) : {};
  const pathSet = new Set(paths.map((p) => p.path));
  const has = (path) => pathSet.has(path);
  const rel = (abs) => relative(root, abs).split(sep).join("/");

  const nextConfig = files.find((f) => /^next\.config\.[mc]?[jt]s$/.test(f.path));
  const isNext = Boolean(deps.next) || Boolean(nextConfig);
  const appDir = ["src/app", "app"].find((d) =>
    paths.some((p) => p.path.startsWith(`${d}/`) && /\/(page|layout)\.[jt]sx?$/.test(p.path)),
  );
  const pagesDir = ["src/pages", "pages"].find((d) =>
    paths.some((p) => p.path.startsWith(`${d}/`) && /\.[jt]sx?$/.test(p.path)),
  );

  /** Application source: code files that are not tests, fixtures or build config. */
  const sourceFiles = files.filter(
    (f) =>
      isCodeFile(f.path) && !isTestFile(f.path) && !/(^|\/)[^/]+\.config\.[mc]?[jt]s$/.test(f.path),
  );

  // .env.example: the project's own, else the monorepo root's.
  let envExample = ENV_EXAMPLES.find((name) => has(name));
  let envExampleAbs = envExample ? join(root, envExample) : undefined;
  if (!envExample && workspaceRoot) {
    const name = ENV_EXAMPLES.find((n) => existsSync(join(workspaceRoot, n)));
    if (name) {
      envExampleAbs = join(workspaceRoot, name);
      envExample = rel(envExampleAbs);
    }
  }

  const strict = has("tsconfig.json")
    ? tsStrict(join(root, "tsconfig.json"))
    : { value: undefined };

  return {
    root,
    files,
    paths,
    sourceFiles,
    pkg,
    deps,
    scripts: pkg.scripts ?? {},
    /** Scripts of the monorepo root (lint/test often live there). */
    workspaceScripts: workspacePkg.scripts ?? {},
    has,
    hasDep: (re) => Object.keys(deps).some((d) => re.test(d)),
    isNext,
    usesTypeScript: has("tsconfig.json") || Boolean(deps.typescript),
    tsStrict: {
      value: strict.value,
      file: strict.abs ? rel(strict.abs) : undefined,
      index: strict.index,
    },
    appDir,
    pagesDir,
    nextConfig,
    nextConfigCode: nextConfig ? stripComments(nextConfig.content) : "",
    envExample,
    envExampleNames: envExampleAbs ? readEnvExampleNames(envExampleAbs) : [],
    ...findLockfile(root, workspaceRoot, pkg),
  };
}

/** @typedef {ReturnType<typeof buildContext>} Context */
