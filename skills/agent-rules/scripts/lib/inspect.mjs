import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { detectLibraries } from "./catalog.mjs";
import {
  ancestors,
  collectSources,
  findPaths,
  hasDirective,
  isRouteFile,
  isTestFile,
  listDir,
  parseJsonc,
  readText,
  rel,
  SKIP_DIRS,
} from "./files.mjs";

const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
];

/** Script names that clash with a package manager's own commands, so they need `run`. */
const BUILTINS = {
  pnpm: new Set(["install", "add", "remove", "update", "audit", "outdated", "publish", "link"]),
  yarn: new Set(["install", "add", "remove", "upgrade", "audit", "info", "publish", "link"]),
  npm: new Set(),
  bun: new Set(),
};

/** How to run a package.json script with each package manager. */
export function runCommand(manager, script) {
  if (manager === "npm")
    return ["test", "start"].includes(script) ? `npm ${script}` : `npm run ${script}`;
  // `bun test` runs Bun's own test runner, not the "test" script.
  if (manager === "bun") return `bun run ${script}`;
  return BUILTINS[manager]?.has(script) ? `${manager} run ${script}` : `${manager} ${script}`;
}

/** How to run a binary from node_modules with each package manager. */
export function execCommand(manager, bin) {
  return (
    { pnpm: `pnpm exec ${bin}`, yarn: `yarn ${bin}`, bun: `bunx ${bin}` }[manager] ?? `npx ${bin}`
  );
}

/** `packages:` entries of a pnpm-workspace.yaml (enough YAML for that one list). */
function pnpmWorkspacePatterns(yaml) {
  const patterns = [];
  let inPackages = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages || /^\s*(#.*)?$/.test(line)) continue;
    const item = /^\s+-\s*["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(line);
    if (!item) break;
    patterns.push(item[1] ?? "");
  }
  return patterns;
}

/** Minimal glob match for workspace patterns (`apps/*`, `packages/**`, `web`). */
function matchesWorkspace(path, patterns) {
  const included = patterns.filter((p) => !p.startsWith("!"));
  return included.some((p) => {
    const re = p
      .replace(/\/+$/, "")
      .split("/")
      .map((seg) =>
        seg === "**" ? ".*" : seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"),
      )
      .join("/");
    return new RegExp(`^${re}$`).test(path);
  });
}

function detectPackageManager(root, pkg, workspaceRoot) {
  const dirs = [root];
  if (workspaceRoot && workspaceRoot !== root) dirs.push(workspaceRoot);
  for (const dir of dirs) {
    for (const [file, name] of LOCKFILES) {
      if (existsSync(join(dir, file))) {
        return { name, lockfile: rel(root, join(dir, file)), source: "lockfile" };
      }
    }
  }
  const declared = /^(pnpm|yarn|npm|bun)@/.exec(pkg.packageManager ?? "");
  if (declared?.[1]) return { name: declared[1], lockfile: null, source: "packageManager field" };
  return { name: "npm", lockfile: null, source: "default (no lockfile found)" };
}

function detectWorkspaces(root, pkg) {
  /** @type {string[]} */
  let patterns = [];
  let tool = null;
  for (const dir of ancestors(root)) {
    const yaml = readText(join(dir, "pnpm-workspace.yaml"));
    const dirPkg = dir === root ? pkg : parseJsonc(readText(join(dir, "package.json")));
    const pkgWorkspaces = Array.isArray(dirPkg?.workspaces)
      ? dirPkg.workspaces
      : dirPkg?.workspaces?.packages;
    if (yaml !== undefined) {
      patterns = pnpmWorkspacePatterns(yaml);
      tool = "pnpm workspaces";
    } else if (Array.isArray(pkgWorkspaces)) {
      patterns = pkgWorkspaces;
      tool = "package.json workspaces";
    }
    // A parent workspace only counts when it actually includes this project.
    if (tool && dir !== root && !matchesWorkspace(rel(dir, root), patterns)) break;
    if (tool) {
      const orchestrators = [
        ["turbo.json", "Turborepo"],
        ["nx.json", "Nx"],
        ["lerna.json", "Lerna"],
      ]
        .filter(([file]) => existsSync(join(dir, file)))
        .map(([, name]) => name);
      return {
        monorepo: true,
        tool,
        orchestrators,
        workspaceRootAbs: dir,
        workspaceRoot: rel(root, dir) || ".",
        isWorkspaceRoot: dir === root,
        patterns,
      };
    }
  }
  return {
    monorepo: false,
    tool: null,
    orchestrators: [],
    workspaceRootAbs: null,
    workspaceRoot: null,
    isWorkspaceRoot: false,
    patterns: [],
  };
}

/** tsconfig compilerOptions, following relative `extends`. */
function readTsconfig(root) {
  const file = ["tsconfig.json", "jsconfig.json"].find((f) => existsSync(join(root, f)));
  if (!file) return null;
  /** @type {Record<string, unknown>} */
  const options = {};
  const chain = [];
  let abs = join(root, file);
  for (let i = 0; i < 5 && abs; i++) {
    const json = parseJsonc(readText(abs));
    if (!json) break;
    chain.unshift(json.compilerOptions ?? {});
    const ext = Array.isArray(json.extends) ? json.extends[0] : json.extends;
    if (typeof ext !== "string" || !ext.startsWith(".")) {
      if (typeof ext === "string") chain.unshift({ __extendsPackage: ext });
      break;
    }
    const next = resolve(dirname(abs), ext.endsWith(".json") ? ext : `${ext}.json`);
    abs = existsSync(next) ? next : "";
  }
  for (const layer of chain) Object.assign(options, layer);
  const flag = (name) => (typeof options[name] === "boolean" ? options[name] : null);
  return {
    file,
    extendsPackage: typeof options.__extendsPackage === "string" ? options.__extendsPackage : null,
    strict: flag("strict"),
    noUncheckedIndexedAccess: flag("noUncheckedIndexedAccess"),
    exactOptionalPropertyTypes: flag("exactOptionalPropertyTypes"),
    noImplicitAny: flag("noImplicitAny"),
    allowJs: flag("allowJs"),
    paths:
      options.paths && typeof options.paths === "object"
        ? Object.fromEntries(
            Object.entries(options.paths).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]),
          )
        : {},
  };
}

const firstExisting = (root, candidates) =>
  candidates.find((c) => existsSync(join(root, c))) ?? null;

function detectRouter(root) {
  const isDir = (p) => {
    try {
      return statSync(join(root, p)).isDirectory();
    } catch {
      return false;
    }
  };
  const app = ["src/app", "app"].find(isDir) ?? null;
  const pages = ["src/pages", "pages"].find(isDir) ?? null;
  const mw = (name) =>
    firstExisting(
      root,
      ["src/", ""].flatMap((d) => ["ts", "js", "mjs"].map((ext) => `${d}${name}.${ext}`)),
    );
  return {
    type: app && pages ? "app + pages" : app ? "app" : pages ? "pages" : "unknown",
    app,
    pages,
    srcDir: isDir("src"),
    middleware: mw("middleware"),
    proxy: mw("proxy"),
    nextConfig: firstExisting(root, [
      "next.config.ts",
      "next.config.mjs",
      "next.config.js",
      "next.config.cjs",
    ]),
  };
}

const SCRIPT_KINDS = [
  ["dev", /^dev$|^start:dev$/],
  ["build", /^build$/],
  ["start", /^start$/],
  ["lint", /^lint(:fix)?$|^check$/],
  ["format", /^format(:check|:fix)?$|^fmt$/],
  ["typecheck", /^(typecheck|type-check|types|tsc|check-types|check:types)$/],
  ["test", /^test(:unit|:watch|:integration|:coverage)?$/],
  ["e2e", /^(test:)?e2e(:.+)?$|^test:browser$/],
  ["db", /^(db|drizzle|prisma|migrate|supabase)(:.+)?$/],
];

/** How to run a member's script from the workspace root. */
export function filterCommand(manager, pkgName, script) {
  if (manager === "pnpm") return `pnpm --filter ${pkgName} ${script}`;
  if (manager === "yarn") return `yarn workspace ${pkgName} ${script}`;
  if (manager === "bun") return `bun run --filter ${pkgName} ${script}`;
  return `npm run ${script} -w ${pkgName}`;
}

function describeScripts(pkg, manager, member = false) {
  return Object.entries(pkg.scripts ?? {}).map(([name, command]) => ({
    name,
    command: String(command),
    run: runCommand(manager, name),
    ...(member && pkg.name ? { fromRoot: filterCommand(manager, pkg.name, name) } : {}),
    // npm's placeholder "test" script is not a test suite.
    kind: /no test specified/.test(String(command))
      ? null
      : (SCRIPT_KINDS.find(([, re]) => re.test(name))?.[0] ?? null),
  }));
}

/** Directory tree to depth 2 (directories only, plus notable root files). */
function directoryMap(root) {
  const lines = [];
  for (const entry of listDir(root)) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && ![".github", ".cursor", ".claude"].includes(entry.name)) {
      continue;
    }
    const children = listDir(join(root, entry.name)).filter(
      (c) => c.isDirectory() && !SKIP_DIRS.has(c.name),
    );
    lines.push({
      path: `${entry.name}/`,
      children: children.slice(0, 15).map((c) => `${c.name}/`),
      more: Math.max(0, children.length - 15),
    });
  }
  return lines;
}

const unique = (items) => [...new Set(items)].sort();
const dirOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "./");

function locate(root, sources) {
  const appCode = sources.filter((f) => !isTestFile(f.path));
  const routeHandlers = appCode.filter((f) => isRouteFile(f.path)).map((f) => f.path);
  const actionFiles = appCode
    .filter((f) => hasDirective(f.content, "use server"))
    .map((f) => f.path);
  const inlineActions = appCode
    .filter((f) => !actionFiles.includes(f.path) && /\{\s*["']use server["']/.test(f.content))
    .map((f) => f.path);
  const schema = appCode
    .filter(
      (f) =>
        /\b(pgTable|mysqlTable|sqliteTable)\s*\(/.test(f.content) ||
        /(^|\/)schema\.[mc]?[jt]s$/.test(f.path),
    )
    .map((f) => f.path);
  const configs = findPaths(
    root,
    (p, dir) =>
      !dir &&
      /^(drizzle\.config\.[mc]?[jt]s|prisma\/schema\.prisma|supabase\/config\.toml)$/.test(p),
    { maxDepth: 1 },
  );
  const migrations = findPaths(
    root,
    (p, dir) =>
      dir &&
      (/(^|\/)(migrations|drizzle)$/.test(p) ||
        p === "supabase/migrations" ||
        p === "prisma/migrations"),
    { maxDepth: 3 },
  ).filter((p) => !p.startsWith("node_modules"));
  const components = findPaths(root, (p, dir) => dir && /(^|\/)components$/.test(p), {
    maxDepth: 3,
  });
  const tests = sources.filter((f) => isTestFile(f.path)).map((f) => f.path);
  const e2eDirs = findPaths(root, (p, dir) => dir && /(^|\/)(e2e|cypress)$/.test(p), {
    maxDepth: 3,
  });
  const clientComponents = appCode.filter((f) => hasDirective(f.content, "use client")).length;
  return {
    routeHandlers,
    serverActions: { files: actionFiles, inline: inlineActions },
    schema: unique([...configs, ...schema]),
    migrations,
    components,
    lib: findPaths(root, (p, dir) => dir && /^(src\/)?(lib|utils|server)$/.test(p), {
      maxDepth: 1,
    }),
    tests: {
      count: tests.length,
      dirs: unique(tests.map(dirOf)).slice(0, 10),
      e2eDirs,
      colocated: tests.some((t) => !/(^|\/)(__tests__|tests?|e2e)\//.test(t)),
    },
    clientComponents,
  };
}

const ENV_EXAMPLES = [
  ".env.example",
  ".env.local.example",
  ".env.sample",
  ".env.template",
  ".env.development.example",
];
const ENV_REAL = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.development.local",
  ".env.production.local",
];

/** Variable names from example env files. Values are never read into the result. */
function inspectEnv(root, sources, libraries) {
  /** @type {{ name: string; file: string; public: boolean }[]} */
  const vars = [];
  const files = ENV_EXAMPLES.filter((f) => existsSync(join(root, f)));
  for (const file of files) {
    const text = readText(join(root, file)) ?? "";
    for (const m of text.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
      const name = m[1] ?? "";
      if (!vars.some((v) => v.name === name)) {
        vars.push({ name, file, public: /^(NEXT_PUBLIC_|VITE_|PUBLIC_)/.test(name) });
      }
    }
  }
  const envModule =
    sources.find(
      (f) =>
        /(^|\/)env\.[mc]?[jt]s$/.test(f.path) ||
        /(^|\/)env\/(index|server|client)\.[mc]?[jt]s$/.test(f.path),
    )?.path ?? null;
  const t3 = Boolean(libraries.env?.length);
  const readsProcessEnv = sources
    .filter(
      (f) =>
        !isTestFile(f.path) &&
        f.path !== envModule &&
        !/(^|\/)(env\/|[^/]*\.config\.)/.test(f.path) &&
        /process\.env\b/.test(f.content),
    )
    .map((f) => f.path);
  return {
    exampleFiles: files,
    names: vars,
    localFiles: ENV_REAL.filter((f) => existsSync(join(root, f))),
    validation: envModule ? { file: envModule, library: t3 ? "T3 Env" : null } : null,
    directProcessEnv: readsProcessEnv,
  };
}

const AGENT_FILES = [
  /^(.+\/)?CLAUDE\.md$/,
  /^CLAUDE\.local\.md$/,
  /^(.+\/)?AGENTS\.md$/,
  /^GEMINI\.md$/,
  /^\.cursorrules$/,
  /^\.cursor\/rules\/.+\.mdc?$/,
  /^\.github\/copilot-instructions\.md$/,
  /^\.github\/instructions\/.+\.md$/,
  /^\.windsurfrules$/,
  /^\.windsurf\/rules\/.+\.md$/,
  /^\.clinerules(\/.+)?$/,
  /^\.claude\/settings(\.local)?\.json$/,
];

function findAgentFiles(root) {
  return findPaths(root, (p, dir) => !dir && AGENT_FILES.some((re) => re.test(p)), {
    maxDepth: 4,
  }).map((path) => {
    const text = readText(join(root, path)) ?? "";
    return {
      path,
      lines: text ? text.split(/\r?\n/).length : 0,
      headings: [...text.matchAll(/^#{1,3}\s+(.+)$/gm)]
        .map((m) => (m[1] ?? "").trim())
        .slice(0, 12),
      imports: [...text.matchAll(/^\s*@([\w./-]+\.md)\s*$/gm)].map((m) => m[1] ?? ""),
    };
  });
}

function otherFacts(root) {
  return {
    ci: findPaths(root, (p, dir) => !dir && /^\.github\/workflows\/.+\.ya?ml$/.test(p), {
      maxDepth: 2,
    }),
    deploy: [
      ["vercel.json", "Vercel"],
      ["Dockerfile", "Docker"],
      ["docker-compose.yml", "Docker Compose"],
      ["compose.yaml", "Docker Compose"],
      ["fly.toml", "Fly.io"],
      ["netlify.toml", "Netlify"],
      ["railway.json", "Railway"],
      ["render.yaml", "Render"],
    ]
      .filter(([file]) => existsSync(join(root, file)))
      .map(([file, name]) => ({ file, name })),
    shadcn: (() => {
      const json = parseJsonc(readText(join(root, "components.json")));
      if (!json) return null;
      return {
        style: json.style ?? null,
        baseColor: json.tailwind?.baseColor ?? null,
        cssVariables: json.tailwind?.cssVariables ?? null,
        aliases: json.aliases ?? {},
      };
    })(),
    tailwindConfig: firstExisting(root, [
      "tailwind.config.ts",
      "tailwind.config.js",
      "tailwind.config.mjs",
      "tailwind.config.cjs",
    ]),
    nvmrc:
      (readText(join(root, ".nvmrc")) ?? readText(join(root, ".node-version")))?.trim() ?? null,
  };
}

function suggestChecks(scripts, rootScripts, workspaceRoot, manager, ts, libraries) {
  const find = (list, kind) => list.find((s) => s.kind === kind && !/fix|watch/.test(s.name));
  const pick = (kind) => find(scripts, kind);
  const lint = pick("lint");
  const typecheck = pick("typecheck");
  const test = pick("test");
  /** @type {{ step: string; command: string; source: string; cwd: string }[]} */
  const checks = [];
  if (lint) {
    checks.push({ step: "lint", command: lint.run, source: `script "${lint.name}"`, cwd: "." });
  } else {
    const rootLint = find(rootScripts, "lint");
    if (rootLint) {
      checks.push({
        step: "lint",
        command: rootLint.run,
        source: `workspace root script "${rootLint.name}"`,
        cwd: workspaceRoot ?? ".",
      });
    }
  }
  if (typecheck) {
    checks.push({
      step: "typecheck",
      command: typecheck.run,
      source: `script "${typecheck.name}"`,
      cwd: ".",
    });
  } else if (ts) {
    checks.push({
      step: "typecheck",
      command: execCommand(manager, "tsc --noEmit"),
      source: "no typecheck script; suggested",
      cwd: ".",
    });
  }
  if (test) {
    const watchMode =
      libraries.testing?.some((l) => l.label === "Vitest") && /^vitest\s*$/.test(test.command);
    checks.push({
      step: "test",
      command: watchMode ? `${test.run} --run` : test.run,
      source: watchMode
        ? `script "${test.name}" + --run, vitest watches by default`
        : `script "${test.name}"`,
      cwd: ".",
    });
  }
  return checks;
}

function gaps(result) {
  const out = [];
  const kinds = new Set(result.scripts.map((s) => s.kind));
  if (!result.checks.some((c) => c.step === "lint")) out.push("No lint script in package.json.");
  if (!kinds.has("typecheck") && result.typescript) {
    out.push("No typecheck script; `next build` is the only type check (suggest `tsc --noEmit`).");
  }
  if (!kinds.has("test")) out.push("No test script; the project has no automated tests to run.");
  if (result.typescript && result.typescript.strict !== true) {
    out.push("TypeScript `strict` is not enabled.");
  }
  if (!result.env.validation) {
    out.push("No env validation module (env.ts / T3 Env) found; env vars are read unchecked.");
  }
  if (result.env.validation && result.env.directProcessEnv.length) {
    out.push(
      `${result.env.directProcessEnv.length} file(s) read process.env directly instead of ${result.env.validation.file}.`,
    );
  }
  if (result.env.exampleFiles.length === 0) out.push("No .env.example documenting env var names.");
  if (
    result.env.names.some((v) => v.public && /SECRET|SERVICE_ROLE|PRIVATE|PASSWORD/i.test(v.name))
  ) {
    out.push(
      "A NEXT_PUBLIC_ variable name looks like a secret; check it is not exposed to the browser.",
    );
  }
  if (result.router.type === "unknown") out.push("No app/ or pages/ directory found.");
  return out;
}

/**
 * Collects the facts an agent needs to write AGENTS.md for the project at `rootInput`.
 * Read-only: nothing is written and env files with real values are never read.
 */
export function inspectProject(rootInput) {
  const root = resolve(rootInput);
  if (!existsSync(root)) throw new Error(`Path not found: ${root}`);
  const pkg = parseJsonc(readText(join(root, "package.json"))) ?? {};
  const deps = { ...pkg.devDependencies, ...pkg.dependencies };
  const devOnly = new Set(
    Object.keys(pkg.devDependencies ?? {}).filter((d) => !(d in (pkg.dependencies ?? {}))),
  );
  const { workspaceRootAbs, ...workspaces } = detectWorkspaces(root, pkg);
  const packageManager = detectPackageManager(root, pkg, workspaceRootAbs);
  const libraries = detectLibraries(deps, devOnly);
  const sources = collectSources(root);
  const usesSupabaseAuth = sources.some((f) =>
    /\.auth\.(getUser|getSession|signIn\w*)\(/.test(f.content),
  );
  if (
    deps["@supabase/supabase-js"] &&
    usesSupabaseAuth &&
    !libraries.auth?.some((l) => l.label === "Supabase Auth")
  ) {
    libraries.auth ??= [];
    libraries.auth.push({
      label: "Supabase Auth",
      packages: [
        { name: "@supabase/supabase-js", version: deps["@supabase/supabase-js"], dev: false },
      ],
    });
  }
  const typescript = readTsconfig(root);
  const member = workspaces.monorepo && !workspaces.isWorkspaceRoot;
  const scripts = describeScripts(pkg, packageManager.name, member);
  const workspaceScripts =
    member && workspaceRootAbs
      ? describeScripts(
          parseJsonc(readText(join(workspaceRootAbs, "package.json"))) ?? {},
          packageManager.name,
        )
      : [];
  const result = {
    project: pkg.name ?? basename(root),
    root,
    generatedAt: new Date().toISOString(),
    packageManager,
    workspaces,
    node: { engine: pkg.engines?.node ?? null, nvmrc: null },
    versions: {
      next: deps.next ?? null,
      react: deps.react ?? null,
      typescript: deps.typescript ?? null,
    },
    typescript,
    router: detectRouter(root),
    libraries,
    scripts,
    workspaceScripts,
    checks: suggestChecks(
      scripts,
      workspaceScripts,
      workspaces.workspaceRoot,
      packageManager.name,
      typescript,
      libraries,
    ),
    structure: { tree: directoryMap(root), ...locate(root, sources) },
    env: inspectEnv(root, sources, libraries),
    agentFiles: findAgentFiles(root),
    workspaceAgentFiles:
      workspaceRootAbs && workspaceRootAbs !== root
        ? findAgentFiles(workspaceRootAbs)
            .filter((f) => !f.path.includes("/") || f.path.startsWith("."))
            .map((f) => ({ ...f, path: rel(root, join(workspaceRootAbs, f.path)) }))
        : [],
    other: otherFacts(root),
    sourceFiles: sources.length,
    gaps: /** @type {string[]} */ ([]),
  };
  result.node.nvmrc = result.other.nvmrc;
  result.gaps = gaps(result);
  return result;
}
