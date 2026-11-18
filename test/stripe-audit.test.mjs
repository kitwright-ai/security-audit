import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAudit } from "../skills/stripe-audit/scripts/lib/audit.mjs";
import { isSuppressed, maskSecrets } from "../skills/stripe-audit/scripts/lib/findings.mjs";
import { toJson, toMarkdown } from "../skills/stripe-audit/scripts/lib/report.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const INSECURE = here("../fixtures/stripe-audit/insecure-app");
const SECURE = here("../fixtures/stripe-audit/secure-app");
const CLI = here("../skills/stripe-audit/scripts/audit.mjs");

const FAKE_KEYS = [
  "sk_live_FAKEFAKEFAKEFAKE0000",
  "sk_test_FAKEFAKEFAKEFAKE0000",
  "whsec_FAKEFAKEFAKEFAKE0000",
];

const insecure = runAudit(INSECURE);
const at = (check, file) =>
  insecure.findings.filter((f) => f.check === check && (!file || f.file === file));

/** Writes a throwaway project from a { path: content } map. */
function project(files) {
  const root = mkdtempSync(join(tmpdir(), "stripe-audit-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}
const checksIn = (root) => runAudit(root).findings.map((f) => f.check);

describe("insecure fixture: every check fires", () => {
  it.each([
    ["webhook-no-signature", "app/api/webhooks/stripe/route.ts"],
    ["webhook-parsed-body", "app/api/webhooks/billing/route.ts"],
    ["webhook-not-idempotent", "app/api/webhooks/stripe/route.ts"],
    ["webhook-missing-events", undefined],
    ["webhook-error-swallowed", "app/api/webhooks/stripe/route.ts"],
    ["webhook-unhandled-event-error", "app/api/webhooks/billing/route.ts"],
    ["webhook-behind-auth", "middleware.ts"],
    ["fulfillment-on-success-page", "app/success/page.tsx"],
    ["client-controlled-price", "app/actions.ts"],
    ["client-controlled-price", "app/api/checkout/route.ts"],
    ["missing-reference", "app/api/checkout/route.ts"],
    ["secret-key-exposed", "lib/stripe.ts"],
    ["secret-key-exposed", ".env.local"],
    ["secret-key-exposed", "components/Pricing.tsx"],
    ["webhook-secret-hardcoded", "app/api/webhooks/billing/route.ts"],
    ["api-version-unpinned", "lib/stripe.ts"],
    ["live-key-in-dev-files", ".env.local"],
  ])("%s in %s", (check, file) => {
    expect(at(check, file).length).toBeGreaterThan(0);
  });

  it("rates a client-sent amount higher than a client-sent price id", () => {
    expect(at("client-controlled-price", "app/actions.ts")[0]?.severity).toBe("high");
    expect(at("client-controlled-price", "app/api/checkout/route.ts")[0]?.severity).toBe("medium");
  });

  it("lists the subscription events that are not handled", () => {
    const [finding] = at("webhook-missing-events");
    expect(finding?.severity).toBe("high");
    expect(finding?.title).toContain("customer.subscription.deleted");
  });

  it("does not flag the publishable key or the client reference that is present", () => {
    expect(insecure.findings.some((f) => /PUBLISHABLE/.test(f.title))).toBe(false);
    expect(at("missing-reference", "app/actions.ts")).toEqual([]);
  });
});

describe("no false positives", () => {
  it("secure fixture has zero findings", () => {
    expect(runAudit(SECURE).findings).toEqual([]);
  });

  // Only inside the Kitwright monorepo.
  const web = here("../../../apps/web");
  it.runIf(existsSync(web))("apps/web has zero findings", () => {
    expect(runAudit(web).findings).toEqual([]);
  });

  it("ignores non-Stripe webhooks and fulfilment that checks payment_status", () => {
    const root = project({
      "app/api/webhooks/github/route.ts":
        "export async function POST(req: Request) {\n  const body = await req.json();\n  await db.insert(logs).values(body);\n  return Response.json({ ok: true });\n}\n",
      "app/success/page.tsx": [
        "export default async function Page({ searchParams }) {",
        "  const { session_id } = await searchParams;",
        "  const session = await stripe.checkout.sessions.retrieve(session_id);",
        '  if (session.payment_status === "paid") await fulfill(session.id);',
        "  await db.update(orders).set({ seen: true });",
        "  return null;",
        "}",
      ].join("\n"),
    });
    expect(checksIn(root)).toEqual([]);
  });

  it("accepts a server-side catalog lookup keyed by client input", () => {
    const root = project({
      "app/api/checkout/route.ts": [
        "export async function POST(req: Request) {",
        "  const { plan } = await req.json();",
        "  const session = await stripe.checkout.sessions.create({",
        '    mode: "payment",',
        "    client_reference_id: userId,",
        "    line_items: [{ price: PRICES[plan], quantity: 1 }],",
        "  });",
        "}",
      ].join("\n"),
      "app/api/webhooks/stripe/route.ts": [
        "export async function POST(req: Request) {",
        "  const event = await stripe.webhooks.constructEventAsync(await req.text(), sig, secret);",
        "  return Response.json({ received: true });",
        "}",
      ].join("\n"),
    });
    expect(checksIn(root)).toEqual([]);
  });
});

describe("other project shapes", () => {
  it("Pages Router webhook without bodyParser: false verifies a parsed body", () => {
    const handler = [
      "export default async function handler(req, res) {",
      '  const event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], secret);',
      "  res.json({ received: true });",
      "}",
    ].join("\n");
    expect(checksIn(project({ "pages/api/webhooks/stripe.ts": handler }))).toContain(
      "webhook-parsed-body",
    );
    const raw = `export const config = { api: { bodyParser: false } };\n${handler.replace("req.body", "await buffer(req)")}`;
    expect(checksIn(project({ "pages/api/webhooks/stripe.ts": raw }))).toEqual([]);
  });

  it("reports Checkout without any webhook route", () => {
    const root = project({
      "app/api/checkout/route.ts":
        'const s = await stripe.checkout.sessions.create({ mode: "payment", client_reference_id: id, line_items: [{ price: "price_123", quantity: 1 }] });\n',
    });
    expect(checksIn(root)).toEqual(["webhook-not-found"]);
  });
});

describe("secrets are masked", () => {
  it("masks Stripe keys down to their prefix", () => {
    expect(maskSecrets('new Stripe("sk_live_FAKEFAKEFAKEFAKE0000")')).toBe(
      'new Stripe("sk_live_…")',
    );
    expect(maskSecrets("secret: whsec_FAKEFAKEFAKEFAKE")).toBe("secret: whsec_…");
    expect(maskSecrets("process.env.STRIPE_SECRET_KEY")).toBe("process.env.STRIPE_SECRET_KEY");
  });

  it("never prints full keys in Markdown or JSON output", () => {
    const md = toMarkdown(insecure);
    const json = toJson(insecure);
    for (const key of FAKE_KEYS) {
      expect(md).not.toContain(key);
      expect(json).not.toContain(key);
    }
    expect(md).toContain("sk_live_…");
    expect(json).not.toContain(INSECURE);
  });
});

describe("suppression", () => {
  const file = (content) => ({ path: "x.ts", content, lines: content.split("\n") });

  it("honors line, previous-line and file-level ignores", () => {
    expect(
      isSuppressed(file("a // stripe-audit-ignore missing-reference"), 1, "missing-reference"),
    ).toBe(true);
    expect(isSuppressed(file("// stripe-audit-ignore other\nb"), 2, "missing-reference")).toBe(
      false,
    );
    expect(
      isSuppressed(
        file("// stripe-audit-ignore-file api-version-unpinned\n\nx"),
        3,
        "api-version-unpinned",
      ),
    ).toBe(true);
  });
});

describe("report and CLI", () => {
  it("renders every category with a summary", () => {
    const md = toMarkdown(insecure);
    expect(md).toMatch(/^# Stripe audit report/);
    expect(md).toContain("| 🔴 HIGH |");
    for (const heading of [
      "Webhook handling",
      "Checkout and fulfillment",
      "Keys and configuration",
    ]) {
      expect(md).toContain(`## ${heading}`);
    }
    expect(toMarkdown(runAudit(SECURE))).toContain("✅ No issues found.");
  });

  it("exits 1 with --fail-on when findings meet the threshold, 0 otherwise", () => {
    const bad = spawnSync("node", [CLI, INSECURE, "--fail-on", "high"], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain("# Stripe audit report");
    const lowOnly = project({
      "lib/stripe.ts": "export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);\n",
    });
    expect(spawnSync("node", [CLI, lowOnly, "--fail-on", "medium"]).status).toBe(0);
    expect(spawnSync("node", [CLI, lowOnly, "--fail-on", "low"]).status).toBe(1);
    expect(spawnSync("node", [CLI, SECURE, "--fail-on", "low"]).status).toBe(0);
    expect(spawnSync("node", [CLI, SECURE, "--fail-on", "nope"]).status).toBe(2);
  });

  it("outputs JSON with --json", () => {
    const json = JSON.parse(execFileSync("node", [CLI, SECURE, "--json"], { encoding: "utf8" }));
    expect(json).toMatchObject({ project: "secure-app", usesStripe: true, findings: [] });
    expect(json.webhookRoutes).toEqual(["/api/webhooks/stripe"]);
  });
});
