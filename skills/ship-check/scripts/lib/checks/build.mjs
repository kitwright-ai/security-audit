import { locate } from "../files.mjs";
import { collector } from "../items.mjs";

const run = (pm, script) => (pm === "npm" ? `npm run ${script}` : `${pm} ${script}`);

/** @param {import("../project.mjs").Context} ctx */
export function checkBuild(ctx) {
  const { items, pass, fail, warn } = collector("build");
  const pm = ctx.packageManager;

  // 1. Type and lint errors hidden from the build.
  if (ctx.nextConfig) {
    const code = ctx.nextConfigCode;
    for (const [re, key, what] of [
      [/ignoreBuildErrors\s*:\s*true/, "typescript.ignoreBuildErrors", "TypeScript errors"],
      [/ignoreDuringBuilds\s*:\s*true/, "eslint.ignoreDuringBuilds", "lint errors"],
    ]) {
      const m = re.exec(code);
      if (m) {
        fail("build-errors-ignored", `\`${key}: true\` ships ${what} to production`, {
          ...locate(ctx.nextConfig, m.index),
          why: "AI tools often add this to make a failing build go green. The errors are still there; they just surface as crashes in front of users instead of in the build log.",
          fix: `Remove \`${key}\`, run \`${run(pm, "build")}\` and fix the errors it reports.`,
        });
      }
    }
    if (!items.some((i) => i.check === "build-errors-ignored")) {
      pass("build-errors-ignored", "Type and lint errors are not ignored during the build");
    }
  }

  // 2. Scripts.
  const s = ctx.scripts;
  if (!ctx.has("package.json")) return items;
  if (s.build) pass("script-build", `\`build\` script present (\`${s.build}\`)`);
  else {
    fail("script-build", "No `build` script in package.json", {
      file: "package.json",
      why: "Hosts (Vercel, Netlify, Docker builds) and the next developer expect `build` to produce the production app.",
      fix: ctx.isNext ? 'Add `"build": "next build"` to `scripts`.' : "Add a `build` script.",
    });
  }
  // In a monorepo, quality scripts at the workspace root count too.
  const real = [...Object.entries(s), ...Object.entries(ctx.workspaceScripts)].filter(
    ([, cmd]) => !/no test specified/.test(String(cmd)),
  );
  const has = (re) => real.some(([name, cmd]) => re.test(name) || re.test(String(cmd)));
  const missing = [
    ["lint", /^lint$|\b(eslint|biome|next lint|oxlint)\b/],
    ["typecheck", /type-?check|check-types|\btsc\b/],
    ["test", /^test$|\b(vitest|jest|playwright|mocha|node --test)\b/],
  ].filter(([name, re]) => !(name === "typecheck" && !ctx.usesTypeScript) && !has(re));
  if (missing.length === 0) pass("script-quality", "Lint, typecheck and test scripts present");
  else {
    const names = missing.map(([n]) => `\`${n}\``);
    const list =
      names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
    warn("script-quality", `No ${list} script`, {
      file: "package.json",
      why: "Without one command per quality gate, nobody (you, the client's next developer, CI) can tell whether a change broke something.",
      fix: `Add the missing scripts, e.g. \`"lint": "eslint ."\`${ctx.usesTypeScript ? ', `"typecheck": "tsc --noEmit"`' : ""}, \`"test": "vitest run"\`, and run them in CI.`,
    });
  }

  // 3. TypeScript strict mode (follows relative `extends`).
  const strict = ctx.tsStrict;
  if (strict.value === true) {
    pass(
      "ts-strict",
      `TypeScript \`strict\` mode is on${strict.file !== "tsconfig.json" ? ` (via \`${strict.file}\`)` : ""}`,
    );
  } else if (strict.value === false) {
    const file = ctx.files.find((f) => f.path === strict.file);
    warn("ts-strict", "TypeScript `strict` mode is off", {
      ...(file && strict.index !== undefined
        ? locate(file, strict.index)
        : { file: strict.file ?? "tsconfig.json" }),
      why: "Without strict mode, `undefined` and `null` slip through the type checker, the most common source of runtime crashes in generated code.",
      fix: 'Set `"strict": true` in `compilerOptions` and fix the errors (often quick, and each one is a real bug candidate).',
    });
  }

  // 4. Lockfile.
  if (ctx.lockfile) pass("lockfile", `Lockfile present (\`${ctx.lockfile}\`, ${pm})`);
  else {
    warn("lockfile", "No lockfile", {
      why: "Without a lockfile every install can resolve different dependency versions, so the build you tested is not the build you deploy.",
      fix: `Run \`${pm} install\` and commit the lockfile it creates.`,
    });
  }

  // 5. Docker needs standalone output.
  const dockerfile = ctx.paths.find((p) => /^(Dockerfile|dockerfile)(\..+)?$/.test(p.path));
  if (ctx.isNext && dockerfile) {
    if (/output\s*:\s*["'`]standalone["'`]/.test(ctx.nextConfigCode)) {
      pass("docker-standalone", '`output: "standalone"` set for the Docker image');
    } else {
      warn(
        "docker-standalone",
        `\`${dockerfile.path}\` found but \`output: "standalone"\` is not set`,
        {
          ...(ctx.nextConfig ? { file: ctx.nextConfig.path } : {}),
          why: "Without standalone output the image has to ship the full node_modules: large, slow to deploy, and easy to get wrong.",
          fix: 'Add `output: "standalone"` to next.config and copy `.next/standalone` and `.next/static` in the Dockerfile.',
        },
      );
    }
  }
  return items;
}
