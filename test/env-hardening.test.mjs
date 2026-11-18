import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inferSchema } from "../skills/env-hardening/scripts/lib/draft.mjs";
import { parseEnvNames } from "../skills/env-hardening/scripts/lib/files.mjs";
import { toMarkdown } from "../skills/env-hardening/scripts/lib/report.mjs";
import { runScan } from "../skills/env-hardening/scripts/lib/scan.mjs";
import { extractUsages } from "../skills/env-hardening/scripts/lib/usages.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const MESSY = here("../fixtures/env-hardening/messy-app");
const CLEAN = here("../fixtures/env-hardening/clean-app");
const CLI = here("../skills/env-hardening/scripts/scan.mjs");

const messy = runScan(MESSY);
const clean = runScan(CLEAN);
const variable = (result, name) => result.variables.find((v) => v.name === name);
const problems = (check, name) =>
  messy.problems.filter((p) => p.check === check && (!name || p.name === name));

// Every value in the fixture's .env.local (the scanner must never output any of them).
const ENV_LOCAL_VALUES = readFileSync(join(MESSY, ".env.local"), "utf8")
  .split("\n")
  .filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => l.slice(l.indexOf("=") + 1));

const usagesOf = (path, content, options = {}) =>
  extractUsages(
    { path, content, lines: content.split("\n") },
    { isEnvModule: false, hasEnvModule: false, ...options },
  );

describe("usage detection", () => {
  it("finds dot, bracket and destructured reads with file:line", () => {
    const { usages } = usagesOf(
      "lib/a.ts",
      [
        "const a = process.env.ALPHA;",
        'const b = process.env["BRAVO"];',
        "const { CHARLIE, DELTA: d, ECHO = 'x' } = process.env;",
        "// process.env.IN_COMMENT",
      ].join("\n"),
    );
    expect(usages.map((u) => [u.name, u.line, u.form])).toEqual([
      ["ALPHA", 1, "dot"],
      ["BRAVO", 2, "bracket"],
      ["CHARLIE", 3, "destructure"],
      ["DELTA", 3, "destructure"],
      ["ECHO", 3, "destructure"],
    ]);
    expect(usages.find((u) => u.name === "ECHO")?.fallback).toBe("string");
  });

  it("detects fallbacks, boolean comparisons and dynamic access", () => {
    const { usages, dynamic } = usagesOf(
      "lib/b.ts",
      [
        'const a = process.env.A || "dev";',
        "const b = process.env.B ?? 3000;",
        "const c = process.env.C || process.env.D;",
        'const e = process.env.E === "true";',
        "const f = process.env[name];",
      ].join("\n"),
    );
    const by = (n) => usages.find((u) => u.name === n);
    expect(by("A")?.fallback).toBe("string");
    expect(by("B")?.fallback).toBe("number");
    expect(by("C")?.fallback).toBeUndefined();
    expect(by("E")?.comparedToBoolean).toBe(true);
    expect(dynamic).toHaveLength(1);
  });

  it("reads next.config env keys and prisma env()", () => {
    expect(
      usagesOf("next.config.js", "module.exports = { env: { FOO: process.env.FOO, BAR: 'x' } };")
        .usages.filter((u) => u.form === "next-config-env")
        .map((u) => u.name),
    ).toEqual(["FOO", "BAR"]);
    expect(
      usagesOf("prisma/schema.prisma", 'url = env("DATABASE_URL")').usages.map((u) => u.name),
    ).toEqual(["DATABASE_URL"]);
  });

  it("parses only names from dotenv files", () => {
    expect(parseEnvNames("# c\nA=1\nexport B=two\n\nC = 3\n")).toEqual([
      { name: "A", line: 2 },
      { name: "B", line: 3 },
      { name: "C", line: 5 },
    ]);
  });
});

describe("classification (messy-app)", () => {
  it("splits client and server variables and records where they are read", () => {
    expect(variable(messy, "NEXT_PUBLIC_APP_URL")).toMatchObject({ side: "client" });
    expect(variable(messy, "DATABASE_URL")).toMatchObject({ side: "server", contexts: ["server"] });
    expect(variable(messy, "SESSION_SECRET")?.contexts).toEqual(["middleware"]);
    expect(variable(messy, "STRIPE_SECRET_KEY")?.contexts.sort()).toEqual([
      "client",
      "next-config",
      "server",
    ]);
    expect(variable(messy, "OPENAI_API_KEY")?.usages[0]).toMatchObject({
      file: "lib/config.ts",
      line: 1,
      form: "destructure",
    });
    expect(variable(messy, "STRIPE_SECRET_KEY")?.usages.map((u) => u.form)).toContain("bracket");
  });

  it("explains publishable and Supabase anon keys instead of flagging them", () => {
    expect(problems("public-secret-name", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")).toEqual([]);
    expect(problems("public-secret-name", "NEXT_PUBLIC_SUPABASE_ANON_KEY")).toEqual([]);
    expect(messy.notes.find((n) => n.name === "NEXT_PUBLIC_SUPABASE_ANON_KEY")?.note).toMatch(
      /public by design/,
    );
  });

  it("reports no validation module and missing zod", () => {
    expect(messy.validation.detected).toBe(false);
    expect(messy.zodInstalled).toBe(false);
    expect(messy.suggestedEnvPath).toBe("env.ts");
  });
});

describe("problems (messy-app)", () => {
  it.each([
    ["public-secret-name", "NEXT_PUBLIC_STRIPE_SECRET_KEY", "components/Checkout.tsx", "high"],
    ["server-var-in-client", "STRIPE_SECRET_KEY", "components/Checkout.tsx", "high"],
    ["next-config-env-secret", "STRIPE_SECRET_KEY", "next.config.js", "high"],
    ["fallback-default", "SESSION_SECRET", "middleware.ts", "high"],
    ["fallback-default", "STRIPE_WEBHOOK_SECRET", "lib/stripe.ts", "high"],
    ["fallback-default", "SMTP_PORT", "lib/config.ts", "medium"],
    ["missing-from-example", "OPENAI_API_KEY", "lib/config.ts", "medium"],
    ["missing-from-example", "FEATURE_BETA", "app/api/flags/route.ts", "medium"],
    ["unused-in-example", "LEGACY_API_URL", ".env.example", "low"],
    ["client-var-not-inlined", "NEXT_PUBLIC_APP_URL", "components/Checkout.tsx", "medium"],
  ])("%s for %s in %s", (check, name, file, severity) => {
    expect(problems(check, name)).toContainEqual(expect.objectContaining({ file, severity }));
  });

  it("flags project-level gaps", () => {
    expect(problems("env-file-not-ignored")).toContainEqual(
      expect.objectContaining({ file: ".env.local", severity: "high" }),
    );
    expect(problems("no-env-validation")).toHaveLength(1);
    expect(problems("dynamic-env-access")).toContainEqual(
      expect.objectContaining({ file: "components/Flags.tsx" }),
    );
  });

  it("does not ask to document a leaked NEXT_PUBLIC_ secret or built-ins", () => {
    expect(problems("missing-from-example", "NEXT_PUBLIC_STRIPE_SECRET_KEY")).toEqual([]);
    expect(problems("missing-from-example", "APP_NAME")).toEqual([]);
    expect(problems("missing-from-example", "DATABASE_URL")).toEqual([]);
  });

  it("masks hard-coded default secrets in snippets", () => {
    const snippet = problems("fallback-default", "SESSION_SECRET")[0]?.snippet ?? "";
    expect(snippet).toContain("process.env.SESSION_SECRET");
    expect(snippet).not.toContain("dev-session-secret");
  });
});

describe("clean-app", () => {
  it("has zero problems", () => {
    expect(clean.problems).toEqual([]);
  });

  it("detects the existing env module and counts schema keys as documented usage", () => {
    expect(clean.validation.modules).toEqual([{ file: "src/env.ts", kind: "zod" }]);
    expect(clean.zodInstalled).toBe(true);
    expect(clean.suggestedEnvPath).toBe("src/env.ts");
    expect(variable(clean, "DATABASE_URL")?.contexts).toEqual(["env-module", "server"]);
    expect(clean.draft.envExample).toBe("");
  });

  it("flags env.X of a server variable in a client component", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-hardening-"));
    writeFileSync(join(dir, "env.ts"), 'import { z } from "zod";\nconst s = process.env;\n');
    writeFileSync(
      join(dir, "Button.tsx"),
      '"use client";\nimport { env } from "./env";\nexport const k = env.STRIPE_SECRET_KEY;\n',
    );
    expect(runScan(dir).problems).toContainEqual(
      expect.objectContaining({ check: "server-var-in-client", file: "Button.tsx", line: 3 }),
    );
  });
});

describe("draft env.ts", () => {
  const draft = messy.draft.envTs;
  const section = (name) => {
    const match = new RegExp(`const ${name} = \\{\\n([\\s\\S]*?)\\n\\};`).exec(draft);
    return match?.[1] ?? "";
  };

  it("puts each name in the right schema", () => {
    const server = section("server");
    const client = section("client");
    for (const name of ["DATABASE_URL", "STRIPE_SECRET_KEY", "SESSION_SECRET", "OPENAI_API_KEY"]) {
      expect(server).toMatch(new RegExp(`^ {2}${name}: `, "m"));
      expect(client).not.toContain(name);
    }
    for (const name of ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
      expect(client).toMatch(new RegExp(`^ {2}${name}: `, "m"));
    }
    expect(section("clientRuntimeEnv")).toContain(
      "NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,",
    );
    expect(draft).not.toMatch(/^ {2}NEXT_PUBLIC_STRIPE_SECRET_KEY:/m);
    expect(messy.draft.notes.join()).toContain("NEXT_PUBLIC_STRIPE_SECRET_KEY looks like a secret");
    expect(draft).not.toContain("APP_NAME");
  });

  it("infers conservative types", () => {
    expect(draft).toContain('STRIPE_SECRET_KEY: z.string().startsWith("sk_"),');
    expect(draft).toContain('STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),');
    expect(draft).toContain("SMTP_PORT: z.coerce.number().int().positive(),");
    expect(draft).toContain("SUPPORT_EMAIL: z.string().email(),");
    expect(draft).toContain('FEATURE_BETA: z.enum(["true", "false"]),');
    expect(draft).toContain("OPENAI_API_KEY: z.string().min(1),");
    expect(inferSchema("NODE_ENV")).toContain("z.enum(");
    expect(inferSchema("SOMETHING")).toBe("z.string().min(1)");
  });

  it("keeps the runtime check and the browser guard from the template", () => {
    expect(draft).toContain("Invalid environment variables");
    expect(draft).toContain("was read in the browser");
    expect(draft).not.toContain("/* @server */");
  });

  it("never contains values from .env files or code defaults", () => {
    const md = toMarkdown(messy);
    const json = JSON.stringify(messy);
    for (const value of [...ENV_LOCAL_VALUES, "dev-session-secret", "whsec_dev_only"]) {
      expect(draft).not.toContain(value);
      expect(md).not.toContain(value);
      expect(json).not.toContain(value);
    }
  });

  it("drafts .env.example additions with names only", () => {
    const lines = messy.draft.envExample.split("\n").filter((l) => l && !l.startsWith("#"));
    expect(lines).toContain("OPENAI_API_KEY=");
    expect(lines).toContain("NEXT_PUBLIC_SUPABASE_URL=");
    expect(lines).not.toContain("DATABASE_URL=");
    expect(lines.every((l) => /^[A-Z_]+=$/.test(l))).toBe(true);
  });
});

describe("report, JSON and CLI", () => {
  it("renders the report sections", () => {
    const md = toMarkdown(messy);
    expect(md).toMatch(/^# Env hardening report/);
    for (const heading of [
      "## Problems",
      "## Variables",
      "## Public by design",
      "## Draft `env.ts`",
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("`npm install zod`");
    expect(toMarkdown(clean)).toContain("✅ No problems found.");
  });

  it("outputs JSON with a stable shape", () => {
    const json = JSON.parse(execFileSync("node", [CLI, MESSY, "--json"], { encoding: "utf8" }));
    expect(Object.keys(json)).toEqual(
      expect.arrayContaining([
        "project",
        "variables",
        "problems",
        "notes",
        "validation",
        "draft",
        "envFiles",
      ]),
    );
    expect(json.project).toBe("messy-app");
    expect(json.problems[0]).toEqual(
      expect.objectContaining({ check: expect.any(String), severity: "high" }),
    );
    expect(json.variables[0]).toEqual(
      expect.objectContaining({ name: expect.any(String), side: expect.any(String) }),
    );
    expect(JSON.stringify(json)).not.toContain(MESSY);
  });

  it("writes drafts only on request and refuses to overwrite or touch real env files", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-hardening-cli-"));
    const envTs = join(dir, "src", "env.ts");
    const example = join(dir, ".env.example");
    writeFileSync(example, "DATABASE_URL=\n");
    const run = (...a) => spawnSync("node", [CLI, MESSY, ...a], { encoding: "utf8" });

    expect(run("--emit-env", envTs, "--emit-example", example).status).toBe(0);
    expect(readFileSync(envTs, "utf8")).toContain("export const env = createEnv();");
    const exampleText = readFileSync(example, "utf8");
    expect(exampleText.startsWith("DATABASE_URL=\n")).toBe(true);
    expect(exampleText).toContain("OPENAI_API_KEY=");

    expect(run("--emit-env", envTs).status).toBe(2);
    expect(run("--emit-env", envTs, "--force").status).toBe(0);
    expect(run("--emit-example", join(dir, ".env.local")).status).toBe(2);
    expect(existsSync(join(dir, ".env.local"))).toBe(false);
  });

  it("writes the report with --out and exits by --fail-on", () => {
    const out = join(mkdtempSync(join(tmpdir(), "env-hardening-out-")), "report.md");
    const bad = spawnSync("node", [CLI, MESSY, "--out", out, "--fail-on", "high"]);
    expect(bad.status).toBe(1);
    expect(readFileSync(out, "utf8")).toContain("# Env hardening report");
    expect(spawnSync("node", [CLI, CLEAN, "--fail-on", "low"]).status).toBe(0);
  });
});
