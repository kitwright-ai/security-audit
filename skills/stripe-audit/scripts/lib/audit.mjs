import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { checkCheckout } from "./checks/checkout.mjs";
import { checkKeys } from "./checks/keys.mjs";
import { checkMiddleware } from "./checks/middleware.mjs";
import { checkWebhooks } from "./checks/webhooks.mjs";
import { collectFiles, isSourceFile } from "./files.mjs";
import { SEVERITIES } from "./findings.mjs";
import { findStripeWebhooks } from "./routes.mjs";

function readPackageJson(root) {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

function firstMatch(files, re) {
  for (const file of files) {
    if (!isSourceFile(file.path)) continue;
    const m = re.exec(file.content);
    if (m) return { file, index: m.index };
  }
  return undefined;
}

/**
 * Runs every check on the project at `root`.
 * @param {string} rootInput
 */
export function runAudit(rootInput) {
  const root = resolve(rootInput);
  if (!existsSync(root)) throw new Error(`Path not found: ${root}`);
  const files = collectFiles(root);
  const pkg = readPackageJson(root);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const isNext =
    Boolean(deps.next) || files.some((f) => /(^|\/)next\.config\.[mc]?[jt]s$/.test(f.path));

  const stripeSites = {
    subscription: firstMatch(
      files,
      /\bmode\s*:\s*["']subscription["']|\bsubscriptions\.create\s*\(|\bsubscription_data\s*:/,
    ),
    checkout: firstMatch(files, /\bcheckout\.sessions\.create\s*\(/),
  };
  const usesStripe =
    Boolean(deps.stripe) ||
    files.some(
      (f) => isSourceFile(f.path) && /from\s+["']stripe["']|\bnew\s+Stripe\s*\(/.test(f.content),
    );
  const webhooks = findStripeWebhooks(files);

  const ctx = {
    root,
    files,
    isNext,
    webhooks,
    stripeSites,
    usesSubscriptions: Boolean(stripeSites.subscription),
  };
  const findings = [
    ...checkWebhooks(ctx),
    ...checkMiddleware(ctx),
    ...checkCheckout(ctx),
    ...checkKeys(ctx),
  ].sort(
    (a, b) =>
      SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0),
  );

  return {
    project: pkg.name ?? basename(root),
    root,
    scannedFiles: files.length,
    isNext,
    usesStripe,
    usesSubscriptions: ctx.usesSubscriptions,
    webhookRoutes: webhooks.map((w) => w.url),
    generatedAt: new Date().toISOString(),
    findings,
  };
}
