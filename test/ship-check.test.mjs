import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AREAS } from "../skills/ship-check/scripts/lib/items.mjs";
import { toJson, toMarkdown } from "../skills/ship-check/scripts/lib/report.mjs";
import { runShipCheck } from "../skills/ship-check/scripts/lib/run.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const UNREADY = here("../fixtures/ship-check/unready-app");
const READY = here("../fixtures/ship-check/ready-app");
const CLI = here("../skills/ship-check/scripts/check.mjs");

const unready = runShipCheck(UNREADY);
const ready = runShipCheck(READY);
const status = (result, check) =>
  result.items.filter((i) => i.check === check).map((i) => i.status);

/** Copy of a fixture in a temp dir, so tests can add files without touching the repo. */
const tempCopy = (fixture) => {
  const dir = join(mkdtempSync(join(tmpdir(), "ship-check-")), "app");
  cpSync(fixture, dir, { recursive: true });
  return dir;
};

describe("unready fixture: flags every automatable problem", () => {
  it.each([
    // build hygiene
    ["build-errors-ignored", "fail"],
    ["script-quality", "warn"],
    ["ts-strict", "warn"],
    ["lockfile", "warn"],
    ["docker-standalone", "warn"],
    // configuration
    ["env-validation", "warn"],
    ["env-example", "warn"],
    ["public-env-secret", "warn"],
    // error handling
    ["error-boundary", "warn"],
    ["global-error", "warn"],
    ["not-found", "warn"],
    ["loading-states", "warn"],
    // SEO
    ["metadata", "warn"],
    ["metadata-base", "warn"],
    ["robots", "warn"],
    ["sitemap", "warn"],
    ["favicon", "warn"],
    ["og-image", "warn"],
    ["html-lang", "warn"],
    // performance
    ["raw-img", "warn"],
    ["external-fonts", "warn"],
    // security basics
    ["security-headers", "warn"],
    ["powered-by-header", "warn"],
    // observability
    ["error-tracking", "warn"],
    ["console-log", "warn"],
    // data
    ["migrations", "warn"],
    ["seed", "warn"],
    // legal
    ["privacy-policy", "warn"],
    ["terms", "warn"],
    ["cookie-consent", "warn"],
    // email
    ["test-sender", "warn"],
  ])("%s → %s", (check, expected) => {
    expect(status(unready, check)).toContain(expected);
  });

  it("has at least one FAIL or WARN in every automated area", () => {
    const areas = Object.keys(AREAS).filter((a) => a !== "launch");
    for (const area of areas) {
      const flagged = unready.items.filter(
        (i) => i.area === area && (i.status === "fail" || i.status === "warn"),
      );
      expect(flagged.length, area).toBeGreaterThan(0);
    }
  });

  it("flags both ignored build settings with file and line", () => {
    const items = unready.items.filter((i) => i.check === "build-errors-ignored");
    expect(items.map((i) => i.title).join()).toMatch(/ignoreBuildErrors.*ignoreDuringBuilds/);
    expect(items.every((i) => i.file === "next.config.mjs" && i.line)).toBe(true);
  });

  it("counts raw <img> tags and console.log calls with locations", () => {
    const img = unready.items.find((i) => i.check === "raw-img");
    expect(img?.title).toMatch(/^2 raw/);
    expect(img?.locations?.map((l) => l.file)).toEqual(["app/page.tsx", "app/page.tsx"]);
    const logs = unready.items.find((i) => i.check === "console-log");
    expect(logs?.title).toMatch(/^3 `console\.log` calls in 3 files/);
  });

  it("names exactly the variables missing from .env.example", () => {
    const item = unready.items.find((i) => i.check === "env-example");
    expect(item?.title).toContain("`RESEND_API_KEY`");
    expect(item?.title).toContain("`STRIPE_SECRET_KEY`");
    expect(item?.title).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("adds the MANUAL items that depend on the stack", () => {
    for (const check of [
      "security-audit",
      "backups",
      "email-dns",
      "supabase-smtp",
      "domain-https",
      "hosting-env",
      "production-database",
      "auth-urls",
      "stripe-live",
      "uptime-monitoring",
      "rollback-plan",
    ]) {
      expect(status(unready, check), check).toEqual(["manual"]);
    }
  });

  it("verdict is Not ready", () => {
    expect(unready.verdict).toBe("not-ready");
  });
});

describe("ready fixture: no false positives", () => {
  it("has zero FAIL and zero WARN", () => {
    const flagged = ready.items.filter((i) => i.status === "fail" || i.status === "warn");
    expect(flagged).toEqual([]);
    expect(ready.verdict).toBe("ready");
  });

  it("skips stack-specific MANUAL items that don't apply", () => {
    expect(status(ready, "stripe-live")).toEqual([]);
    expect(status(ready, "supabase-smtp")).toEqual([]);
    expect(status(ready, "backups")).toEqual(["manual"]);
  });

  it("ignores <img> inside next/og image routes and console.log in scripts/", () => {
    expect(status(ready, "raw-img")).toEqual(["pass"]);
    expect(status(ready, "console-log")).toEqual(["pass"]);
  });

  it("lists large files in public/", () => {
    const dir = tempCopy(READY);
    mkdirSync(join(dir, "public"), { recursive: true });
    writeFileSync(join(dir, "public", "hero.mp4"), Buffer.alloc(1024 * 1024 + 1));
    const item = runShipCheck(dir).items.find((i) => i.check === "large-assets");
    expect(item).toMatchObject({ status: "warn", file: "public/hero.mp4" });
  });

  it("fails when .env.example is missing entirely", () => {
    const dir = tempCopy(READY);
    rmSync(join(dir, ".env.example"));
    expect(status(runShipCheck(dir), "env-example")).toEqual(["fail"]);
  });

  it("does not count a createEnv code sample inside a string as validation", () => {
    const dir = tempCopy(UNREADY);
    writeFileSync(
      join(dir, "lib", "docs.ts"),
      "export const sample = `export const env = createEnv({ server: {} });`;\n",
    );
    expect(status(runShipCheck(dir), "env-validation")).toEqual(["warn"]);
  });

  it("fails an error boundary without 'use client'", () => {
    const dir = tempCopy(READY);
    writeFileSync(join(dir, "app", "error.tsx"), "export default function E() { return null; }\n");
    expect(status(runShipCheck(dir), "error-boundary")).toEqual(["fail"]);
  });
});

describe("secrets", () => {
  it("never prints environment variable values", () => {
    const dir = tempCopy(UNREADY);
    writeFileSync(
      join(dir, ".env.local"),
      "STRIPE_SECRET_KEY=sk_live_SHIPCHECKVALUE123456\nRESEND_API_KEY=re_SHIPCHECKVALUE987654\n",
    );
    const result = runShipCheck(dir);
    for (const output of [toMarkdown(result), toJson(result)]) {
      expect(output).not.toContain("SHIPCHECKVALUE");
      // values from .env.example are never read either, only names
      expect(output).not.toContain("example-anon-value-do-not-print");
      expect(output).not.toContain("placeholder-project");
    }
  });

  it("does not leak the absolute project path", () => {
    expect(toJson(unready)).not.toContain(UNREADY);
    expect(toMarkdown(unready)).not.toContain(UNREADY);
  });
});

describe("report and CLI", () => {
  it("renders every area, a verdict and the blockers first", () => {
    const md = toMarkdown(unready);
    expect(md).toMatch(/^# Ship check report/);
    expect(md).toContain("**Automated verdict: Not ready**");
    for (const label of Object.values(AREAS)) expect(md).toContain(`## ${label}`);
    expect(md.indexOf("## Blockers")).toBeLessThan(md.indexOf("## Build hygiene"));
    expect(md).toContain("- [ ] 🖐 MANUAL **Rollback plan**");
  });

  it("outputs JSON with a stable shape", () => {
    const json = JSON.parse(execFileSync("node", [CLI, UNREADY, "--json"], { encoding: "utf8" }));
    expect(json).toMatchObject({
      tool: "ship-check",
      project: "unready-app",
      framework: "Next.js (App Router)",
      packageManager: "npm",
      verdict: "not-ready",
      summary: { fail: 2 },
    });
    expect(Object.keys(json.summary)).toEqual(["fail", "warn", "manual", "pass"]);
    for (const item of json.items) {
      expect(Object.keys(AREAS)).toContain(item.area);
      expect(["fail", "warn", "manual", "pass"]).toContain(item.status);
      expect(typeof item.check).toBe("string");
      expect(typeof item.title).toBe("string");
      if (item.status !== "pass") expect(item.fix, item.check).toBeTruthy();
    }
  });

  it("exits 1 with --fail-on fail when a FAIL remains, 0 otherwise", () => {
    const bad = spawnSync("node", [CLI, UNREADY, "--fail-on", "fail"], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain("# Ship check report");
    const good = spawnSync("node", [CLI, READY, "--fail-on", "fail"], { encoding: "utf8" });
    expect(good.status).toBe(0);
    const strict = spawnSync("node", [CLI, READY, "--fail-on", "warn"], { encoding: "utf8" });
    expect(strict.status).toBe(0);
  });

  it("rejects an unknown --fail-on value and a missing path", () => {
    expect(spawnSync("node", [CLI, READY, "--fail-on", "high"]).status).toBe(2);
    expect(spawnSync("node", [CLI, join(READY, "does-not-exist")]).status).toBe(2);
  });

  it("writes the report with --out", () => {
    const out = join(mkdtempSync(join(tmpdir(), "ship-check-out-")), "report.md");
    const run = spawnSync("node", [CLI, READY, "--out", out], { encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stderr).toContain("Report written to");
    expect(readFileSync(out, "utf8")).toMatch(/^# Ship check report/);
  });
});
