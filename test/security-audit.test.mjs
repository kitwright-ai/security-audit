import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAudit } from "../skills/security-audit/scripts/lib/audit.mjs";
import { isSuppressed, maskSecrets } from "../skills/security-audit/scripts/lib/findings.mjs";
import { toMarkdown } from "../skills/security-audit/scripts/lib/report.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const INSECURE = here("../fixtures/security-audit/insecure-app");
const SECURE = here("../fixtures/security-audit/secure-app");
const CLI = here("../skills/security-audit/scripts/audit.mjs");

const insecure = runAudit(INSECURE, { git: false });
const at = (check, file) =>
  insecure.findings.filter((f) => f.check === check && (!file || f.file === file));

describe("insecure fixture: detects at least one case of every category", () => {
  it.each([
    // secrets in repo / exposed to client
    ["hardcoded-secret", "lib/stripe.ts"],
    ["env-file-not-ignored", ".env.production"],
    ["public-env-secret", ".env.production"],
    ["public-env-secret", "next.config.js"],
    ["client-secret-env", "components/AdminPanel.tsx"],
    // routes and actions without auth
    ["route-without-auth", "app/api/invoices/route.ts"],
    ["action-without-auth", "app/actions.ts"],
    ["action-without-auth", "app/dashboard/page.tsx"],
    // queries without tenant filter
    ["query-without-tenant-filter", "app/api/invoices/route.ts"],
    ["query-without-tenant-filter", "app/api/invoices/[id]/route.ts"],
    ["query-without-tenant-filter", "app/actions.ts"],
    // webhooks
    ["webhook-without-signature", "app/api/webhooks/stripe/route.ts"],
    ["webhook-parsed-body", "app/api/webhooks/billing/route.ts"],
    // rate limiting and headers
    ["public-route-without-rate-limit", "app/api/auth/login/route.ts"],
    ["public-route-without-rate-limit", "app/actions.ts"],
    ["missing-security-headers", "next.config.js"],
    // Supabase RLS
    ["supabase-rls-disabled", "supabase/migrations/0001_init.sql"],
    ["supabase-permissive-policy", "supabase/migrations/0001_init.sql"],
  ])("%s in %s", (check, file) => {
    expect(at(check, file).length).toBeGreaterThan(0);
  });

  it("flags the database URL with a password", () => {
    expect(
      at("hardcoded-secret", ".env.production").some((f) => /Database URL/.test(f.title)),
    ).toBe(true);
  });

  it("rates write access higher than read access", () => {
    const policies = at("supabase-permissive-policy");
    expect(policies.find((f) => f.title.includes("profiles"))?.severity).toBe("high");
    expect(policies.find((f) => f.title.includes("products"))?.severity).toBe("medium");
  });

  it("does not ask for authentication on public-by-nature endpoints", () => {
    expect(at("route-without-auth", "app/api/auth/login/route.ts")).toEqual([]);
    expect(at("route-without-auth", "app/api/webhooks/stripe/route.ts")).toEqual([]);
    expect(
      at("action-without-auth")
        .map((f) => f.title)
        .join(),
    ).not.toContain("signUp");
  });

  it("never prints full secrets in the report", () => {
    const md = toMarkdown(insecure);
    expect(md).not.toContain("sk_live_FAKEFAKEFAKEFAKEFAKE1234");
    expect(md).not.toContain("Sup3rS3cretPassw0rd");
  });
});

describe("no false positives", () => {
  it("secure fixture has zero findings", () => {
    expect(runAudit(SECURE, { git: false }).findings).toEqual([]);
  });

  // Only inside the Kitwright monorepo.
  const web = here("../../../apps/web");
  it.runIf(existsSync(web))("apps/web has zero findings", () => {
    expect(runAudit(web, { git: false }).findings).toEqual([]);
  });

  const fieldService = here("../../../kits/field-service");
  it.runIf(existsSync(fieldService))("kits/field-service has zero findings", () => {
    expect(runAudit(fieldService).findings).toEqual([]);
  });
});

describe("env files in monorepos", () => {
  const project = (rules) => {
    const repo = mkdtempSync(join(tmpdir(), "audit-gitignore-"));
    writeFileSync(join(repo, ".gitignore"), rules);
    const app = join(repo, "apps", "web");
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, ".env.local"), "SECRET=1\n");
    return app;
  };
  const envFindings = (dir) =>
    runAudit(dir, { git: false }).findings.filter((f) => f.check.startsWith("env-file"));

  it("honours a .gitignore in a parent directory", () => {
    expect(envFindings(project(".env*\n!.env.example\n"))).toEqual([]);
  });

  it("flags the file when the parent rule re-includes it", () => {
    expect(envFindings(project(".env*\n!apps/**/.env*\n"))).toHaveLength(1);
  });
});

describe("suppression", () => {
  const file = (content) => ({ path: "x.ts", content, lines: content.split("\n") });

  it("honors line, previous-line and file-level ignores", () => {
    expect(
      isSuppressed(file("a // security-audit-ignore route-without-auth"), 1, "route-without-auth"),
    ).toBe(true);
    expect(isSuppressed(file("// security-audit-ignore\nb"), 2, "anything")).toBe(true);
    expect(
      isSuppressed(file("// security-audit-ignore other-check\nb"), 2, "route-without-auth"),
    ).toBe(false);
    expect(
      isSuppressed(
        file("// security-audit-ignore-file hardcoded-secret\n\n\nx"),
        4,
        "hardcoded-secret",
      ),
    ).toBe(true);
  });

  it("masks key-like tokens but keeps identifiers readable", () => {
    expect(maskSecrets('new Stripe("sk_live_FAKEFAKEFAKEFAKEFAKE1234")')).toBe(
      'new Stripe("sk_liv…")',
    );
    expect(maskSecrets("process.env.STRIPE_SECRET_KEY")).toBe("process.env.STRIPE_SECRET_KEY");
  });
});

describe("report and CLI", () => {
  it("renders every category with a summary", () => {
    const md = toMarkdown(insecure);
    expect(md).toMatch(/^# Security audit report/);
    expect(md).toContain("| 🔴 HIGH |");
    for (const heading of [
      "Secrets",
      "Authentication",
      "Tenant",
      "Webhook",
      "Rate limiting",
      "Supabase",
    ]) {
      expect(md).toContain(`## ${heading}`);
    }
    expect(toMarkdown(runAudit(SECURE, { git: false }))).toContain(
      "Not applicable — Supabase is not used.",
    );
  });

  it("exits 1 with --fail-on when findings meet the threshold, 0 otherwise", () => {
    const bad = spawnSync("node", [CLI, INSECURE, "--no-git", "--fail-on", "high"], {
      encoding: "utf8",
    });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain("# Security audit report");
    const good = spawnSync("node", [CLI, SECURE, "--no-git", "--fail-on", "low"], {
      encoding: "utf8",
    });
    expect(good.status).toBe(0);
  });

  it("outputs JSON with --json", () => {
    const json = JSON.parse(
      execFileSync("node", [CLI, SECURE, "--no-git", "--json"], { encoding: "utf8" }),
    );
    expect(json).toMatchObject({ project: "secure-app", findings: [] });
  });
});
