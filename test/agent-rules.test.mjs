import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  execCommand,
  inspectProject,
  runCommand,
} from "../skills/agent-rules/scripts/lib/inspect.mjs";
import { toJson, toMarkdown } from "../skills/agent-rules/scripts/lib/report.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SAAS = here("../fixtures/agent-rules/saas-app");
const SUPA = here("../fixtures/agent-rules/supabase-app");
const CLI = here("../skills/agent-rules/scripts/inspect.mjs");

const saas = inspectProject(SAAS);
const supa = inspectProject(SUPA);
const labels = (result, category) => (result.libraries[category] ?? []).map((l) => l.label);
const script = (result, name) => result.scripts.find((s) => s.name === name);

/** Every value in the fixtures' .env.example files; none may leak into any output. */
const envValues = [SAAS, SUPA].flatMap((dir) =>
  readFileSync(join(dir, ".env.example"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => line.slice(line.indexOf("=") + 1).trim()),
);

describe("package manager and workspaces", () => {
  it("detects the package manager from the lockfile", () => {
    expect(saas.packageManager).toMatchObject({ name: "pnpm", lockfile: "pnpm-lock.yaml" });
    expect(supa.packageManager).toMatchObject({ name: "npm", lockfile: "package-lock.json" });
  });

  it("does not treat an enclosing repo as the project's workspace", () => {
    expect(saas.workspaces.monorepo).toBe(false);
  });

  it("detects a pnpm workspace member and uses the root lockfile", () => {
    const repo = mkdtempSync(join(tmpdir(), "agent-rules-ws-"));
    writeFileSync(join(repo, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n\nother:\n  - x\n');
    writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writeFileSync(join(repo, "turbo.json"), "{}");
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({ name: "root", scripts: { lint: "biome check ." } }),
    );
    writeFileSync(join(repo, "AGENTS.md"), "# Rules\n");
    const app = join(repo, "apps", "web");
    mkdirSync(app, { recursive: true });
    writeFileSync(
      join(app, "package.json"),
      JSON.stringify({ name: "@acme/web", scripts: { test: "vitest run" } }),
    );
    const result = inspectProject(app);
    expect(result.packageManager).toMatchObject({ name: "pnpm", lockfile: "../../pnpm-lock.yaml" });
    expect(result.workspaces).toMatchObject({
      monorepo: true,
      tool: "pnpm workspaces",
      orchestrators: ["Turborepo"],
      workspaceRoot: "../..",
      isWorkspaceRoot: false,
      patterns: ["apps/*"],
    });
    expect(script(result, "test")?.fromRoot).toBe("pnpm --filter @acme/web test");
    expect(result.checks.find((c) => c.step === "lint")).toMatchObject({
      command: "pnpm lint",
      cwd: "../..",
    });
    expect(result.workspaceAgentFiles.map((f) => f.path)).toEqual(["../../AGENTS.md"]);
  });

  it("builds run commands per package manager", () => {
    expect(runCommand("pnpm", "typecheck")).toBe("pnpm typecheck");
    expect(runCommand("pnpm", "audit")).toBe("pnpm run audit");
    expect(runCommand("npm", "test")).toBe("npm test");
    expect(runCommand("npm", "lint")).toBe("npm run lint");
    expect(runCommand("yarn", "lint")).toBe("yarn lint");
    expect(runCommand("bun", "test")).toBe("bun run test");
    expect(execCommand("npm", "tsc --noEmit")).toBe("npx tsc --noEmit");
  });
});

describe("stack and layout", () => {
  it("reads versions and TypeScript flags (tsconfig with comments)", () => {
    expect(saas.versions).toEqual({ next: "16.4.6", react: "19.2.1", typescript: "5.9.3" });
    expect(saas.node.engine).toBe(">=20");
    expect(saas.typescript).toMatchObject({
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: null,
      paths: { "@/*": "./src/*" },
    });
    expect(supa.typescript?.strict).toBe(false);
  });

  it("detects the router, src/ and middleware", () => {
    expect(saas.router).toMatchObject({
      type: "app",
      app: "src/app",
      srcDir: true,
      middleware: "src/middleware.ts",
      proxy: null,
      nextConfig: "next.config.ts",
    });
    expect(supa.router).toMatchObject({
      type: "app",
      app: "app",
      srcDir: false,
      middleware: "middleware.ts",
    });
  });

  it("detects libraries by area", () => {
    expect(labels(saas, "orm")).toEqual(["Drizzle ORM", "drizzle-kit (migrations)"]);
    expect(labels(saas, "database")).toEqual(["postgres.js"]);
    expect(labels(saas, "auth")).toEqual(["Better Auth"]);
    expect(labels(saas, "payments")).toEqual(["Stripe"]);
    expect(labels(saas, "validation")).toEqual(["Zod"]);
    expect(labels(saas, "styling")).toEqual(["Tailwind CSS"]);
    expect(labels(saas, "email")).toEqual(["Resend"]);
    expect(labels(saas, "testing")).toEqual(["Vitest", "Playwright"]);
    expect(labels(saas, "lint")).toEqual(["ESLint", "Prettier"]);
    expect(saas.other.shadcn).toMatchObject({ style: "new-york", baseColor: "neutral" });

    expect(labels(supa, "database")).toEqual(["Supabase"]);
    expect(labels(supa, "auth")).toEqual(["Supabase Auth"]);
    expect(labels(supa, "validation")).toEqual(["Yup"]);
    expect(labels(supa, "state")).toEqual(["TanStack Query", "Zustand"]);
    expect(labels(supa, "testing")).toEqual([]);
    expect(supa.other.shadcn).toBeNull();
    expect(supa.other.tailwindConfig).toBe("tailwind.config.ts");
  });

  it("marks dev-only packages", () => {
    const vitest = saas.libraries.testing?.[0]?.packages[0];
    expect(vitest).toMatchObject({ name: "vitest", dev: true });
    expect(saas.libraries.orm?.[0]?.packages[0]?.dev).toBe(false);
  });

  it("locates route handlers, server actions, schema, migrations, components and tests", () => {
    const s = saas.structure;
    expect(s.routeHandlers).toEqual([
      "src/app/api/auth/[...all]/route.ts",
      "src/app/api/jobs/[id]/route.ts",
      "src/app/api/webhooks/stripe/route.ts",
    ]);
    expect(s.serverActions.files).toEqual(["src/server/jobs.ts"]);
    expect(s.schema).toEqual(["drizzle.config.ts", "src/lib/db/schema.ts"]);
    expect(s.migrations).toEqual(["drizzle/"]);
    expect(s.components).toEqual(["src/components/"]);
    expect(s.tests).toMatchObject({ count: 2, e2eDirs: ["e2e/"], colocated: true });
    expect(s.tree.map((d) => d.path)).toEqual([".github/", "drizzle/", "e2e/", "src/"]);
    expect(s.tree.find((d) => d.path === "src/")?.children).toEqual([
      "app/",
      "components/",
      "lib/",
      "server/",
    ]);

    expect(supa.structure.serverActions.inline).toEqual(["app/bookings/page.tsx"]);
    expect(supa.structure.migrations).toEqual(["supabase/migrations/"]);
    expect(supa.structure.tests.count).toBe(0);
  });
});

describe("scripts and checks", () => {
  it("lists scripts with the command for the detected package manager", () => {
    expect(script(saas, "typecheck")).toMatchObject({
      command: "tsc --noEmit",
      run: "pnpm typecheck",
      kind: "typecheck",
    });
    expect(script(saas, "test:e2e")).toMatchObject({ run: "pnpm test:e2e", kind: "e2e" });
    expect(script(saas, "db:generate")?.kind).toBe("db");
    expect(script(supa, "lint")?.run).toBe("npm run lint");
  });

  it("suggests checks that do not hang in watch mode", () => {
    expect(saas.checks.map((c) => c.command)).toEqual([
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test --run",
    ]);
  });

  it("ignores npm's placeholder test script and suggests tsc when no typecheck script exists", () => {
    expect(supa.checks.map((c) => c.command)).toEqual(["npm run lint", "npx tsc --noEmit"]);
    expect(script(supa, "test")?.kind).toBeNull();
    expect(supa.gaps.join("\n")).toMatch(/No test script/);
    expect(supa.gaps.join("\n")).toMatch(/strict/);
    expect(supa.gaps.join("\n")).toMatch(/No env validation/);
  });
});

describe("environment variables", () => {
  it("lists names from .env.example and marks browser-exposed ones", () => {
    expect(saas.env.names.map((v) => v.name)).toEqual([
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "RESEND_API_KEY",
      "NEXT_PUBLIC_APP_URL",
    ]);
    expect(saas.env.names.find((v) => v.name === "NEXT_PUBLIC_APP_URL")?.public).toBe(true);
    expect(saas.env.validation).toEqual({ file: "src/env.ts", library: null });
    expect(saas.env.directProcessEnv).toEqual(["src/lib/stripe.ts"]);
    expect(saas.gaps.join("\n")).toMatch(/read process\.env directly instead of src\/env\.ts/);
    expect(supa.env.validation).toBeNull();
  });

  it("never includes env values in JSON or Markdown output", () => {
    expect(envValues.length).toBeGreaterThan(5);
    for (const output of [toJson(saas), toMarkdown(saas), toJson(supa), toMarkdown(supa)]) {
      for (const value of envValues) expect(output).not.toContain(value);
    }
  });

  it("notes real env files without reading them", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-rules-env-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, ".env.local"), "API_TOKEN=do-not-print-this-value\n");
    const result = inspectProject(dir);
    expect(result.env.localFiles).toEqual([".env.local"]);
    expect(result.env.names).toEqual([]);
    expect(toJson(result)).not.toContain("do-not-print-this-value");
    expect(toJson(result)).not.toContain("API_TOKEN");
  });
});

describe("existing agent instructions", () => {
  it("lists every agent file so they can be merged", () => {
    expect(saas.agentFiles.map((f) => f.path)).toEqual([".cursorrules"]);
    expect(supa.agentFiles.map((f) => f.path)).toEqual([
      ".cursor/rules/supabase.mdc",
      ".github/copilot-instructions.md",
      "CLAUDE.md",
    ]);
    expect(supa.agentFiles.find((f) => f.path === "CLAUDE.md")).toMatchObject({
      headings: ["Pet sitter booking", "Notes"],
      imports: [],
    });
  });

  it("detects @-imports in CLAUDE.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-rules-claude-"));
    writeFileSync(join(dir, "CLAUDE.md"), "@AGENTS.md\n\n## Claude Code specifics\n");
    writeFileSync(join(dir, "AGENTS.md"), "# AGENTS.md\n");
    const result = inspectProject(dir);
    expect(result.agentFiles.find((f) => f.path === "CLAUDE.md")?.imports).toEqual(["AGENTS.md"]);
    expect(result.router.type).toBe("unknown");
  });
});

describe("Markdown report", () => {
  const md = toMarkdown(saas);

  it("has every section", () => {
    expect(md).toMatch(/^# Project facts: tidyteam/);
    for (const heading of [
      "Tooling",
      "Stack",
      "Next.js layout",
      "Libraries",
      "Scripts",
      "Project structure",
      "Environment variables",
      "Existing agent instructions",
      "Gaps worth asking about",
    ]) {
      expect(md).toContain(`## ${heading}`);
    }
  });

  it("shows the facts an agent needs", () => {
    expect(md).toContain("**Package manager:** pnpm (lockfile `pnpm-lock.yaml`)");
    expect(md).toContain("| typecheck | `pnpm typecheck` | `tsc --noEmit` | typecheck |");
    expect(md).toContain("- `pnpm test --run`");
    expect(md).toContain("App Router in `src/app/`");
    expect(md).toContain("| Authentication | Better Auth (`better-auth@1.7.22`) |");
    expect(md).toContain("| `NEXT_PUBLIC_APP_URL` | yes | .env.example |");
    expect(md).toContain("- `.cursorrules` — 9 lines");
  });
});

describe("CLI", () => {
  it("prints Markdown by default", () => {
    const out = execFileSync("node", [CLI, SAAS], { encoding: "utf8" });
    expect(out).toMatch(/^# Project facts: tidyteam/);
  });

  it("prints JSON with --json", () => {
    const json = JSON.parse(execFileSync("node", [CLI, SUPA, "--json"], { encoding: "utf8" }));
    expect(json).toMatchObject({
      project: "pet-sitter-booking",
      packageManager: { name: "npm" },
      router: { type: "app" },
    });
  });

  it("writes only to --out", () => {
    const out = join(mkdtempSync(join(tmpdir(), "agent-rules-out-")), "facts.md");
    const res = spawnSync("node", [CLI, "--out", out, SAAS], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(readFileSync(out, "utf8")).toMatch(/^# Project facts: tidyteam/);
  });

  it("exits 2 on a missing path", () => {
    const res = spawnSync("node", [CLI, join(tmpdir(), "agent-rules-does-not-exist")], {
      encoding: "utf8",
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("Path not found");
  });
});
