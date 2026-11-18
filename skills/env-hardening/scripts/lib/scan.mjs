import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { checkProblems } from "./checks.mjs";
import { planSchema, renderEnvExample, renderEnvTs } from "./draft.mjs";
import { collectFiles, isTestFile } from "./files.mjs";
import { publicByDesignNote, sideOf, TOOLING } from "./names.mjs";
import { envModuleKind, extractUsages } from "./usages.mjs";

function readPackageJson(root) {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

function packageManager(root, pkg) {
  const declared = /^(pnpm|yarn|bun|npm)@/.exec(pkg.packageManager ?? "");
  if (declared) return declared[1];
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  return "npm";
}

/**
 * Scans the project at `rootInput` for env variable usage. Read-only. Values from .env files are
 * never read into the result: only names.
 * @param {string} rootInput
 */
export function runScan(rootInput) {
  const root = resolve(rootInput);
  if (!existsSync(root)) throw new Error(`Path not found: ${root}`);
  const { sources: allSources, envFiles } = collectFiles(root);
  const sources = allSources.filter((f) => !isTestFile(f.path));
  const pkg = readPackageJson(root);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  const envModules = sources
    .map((f) => ({ file: f.path, kind: envModuleKind(f) }))
    .filter((m) => m.kind !== null);
  const moduleFiles = new Set(envModules.map((m) => m.file));

  const usages = [];
  const dynamic = [];
  for (const file of sources) {
    const found = extractUsages(file, {
      isEnvModule: moduleFiles.has(file.path),
      hasEnvModule: moduleFiles.size > 0,
    });
    usages.push(...found.usages);
    dynamic.push(...found.dynamic);
  }

  const examples = envFiles.filter((f) => f.template);
  const documented = new Set(examples.flatMap((f) => f.names.map((n) => n.name)));

  /** @type {Map<string, any>} */
  const variables = new Map();
  const variable = (name) => {
    if (!variables.has(name)) {
      variables.set(name, {
        name,
        side: sideOf(name),
        contexts: [],
        readInCode: false,
        inExample: documented.has(name),
        definedIn: [],
        usages: [],
      });
    }
    return variables.get(name);
  };
  const byLocation = (a, b) => a.file.localeCompare(b.file) || a.line - b.line;
  usages.sort(byLocation);
  for (const u of usages) {
    if (TOOLING.test(u.name)) continue;
    const v = variable(u.name);
    v.usages.push(u);
    if (u.form !== "next-config-env") v.readInCode = true;
    if (!v.contexts.includes(u.context)) v.contexts.push(u.context);
  }
  for (const f of envFiles) {
    for (const { name, line } of f.names) {
      variable(name).definedIn.push({ file: f.path, line, template: f.template });
    }
  }

  const ctx = {
    root,
    sources: new Map(sources.map((f) => [f.path, f])),
    envFiles,
    variables,
    usages,
    dynamic,
    envModules,
    examples,
  };
  const problems = checkProblems(ctx);
  const plan = planSchema(variables);

  const notes = [...variables.values()]
    .map((v) => ({ name: v.name, note: publicByDesignNote(v.name) }))
    .filter((n) => n.note);

  return {
    project: pkg.name ?? basename(root),
    generatedAt: new Date().toISOString(),
    scannedFiles: sources.length,
    isNext:
      Boolean(deps.next) || sources.some((f) => /(^|\/)next\.config\.[mc]?[jt]s$/.test(f.path)),
    packageManager: packageManager(root, pkg),
    zodInstalled: Boolean(deps.zod),
    validation: {
      detected: envModules.length > 0,
      modules: envModules,
      t3EnvInstalled: Object.keys(deps).some((d) => d.startsWith("@t3-oss/env-")),
    },
    suggestedEnvPath: existsSync(join(root, "src")) ? "src/env.ts" : "env.ts",
    envFiles: envFiles.map((f) => ({ file: f.path, template: f.template, names: f.names.length })),
    variables: [...variables.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ definedIn, ...v }) => ({
        ...v,
        definedIn: definedIn.map((d) => d.file),
      })),
    dynamicAccess: dynamic,
    problems,
    notes,
    draft: {
      notes: plan.notes,
      envTs: renderEnvTs(plan),
      envExample: renderEnvExample(plan, documented),
    },
  };
}
