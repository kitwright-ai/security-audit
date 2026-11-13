import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { checkAuth } from "./checks/auth.mjs";
import { checkHardening } from "./checks/hardening.mjs";
import { checkSecrets } from "./checks/secrets.mjs";
import { checkSupabase } from "./checks/supabase.mjs";
import { checkTenancy } from "./checks/tenancy.mjs";
import { checkWebhooks } from "./checks/webhooks.mjs";
import { collectFiles } from "./files.mjs";
import { SEVERITIES } from "./findings.mjs";

function readPackageJson(root) {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

/**
 * Runs every check on the project at `root`.
 * @param {string} rootInput
 * @param {{ git?: boolean }} [options] `git: false` ignores git state (used in tests).
 */
export function runAudit(rootInput, options = {}) {
  const root = resolve(rootInput);
  if (!existsSync(root)) throw new Error(`Path not found: ${root}`);
  const files = collectFiles(root);
  const pkg = readPackageJson(root);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const isNext =
    Boolean(deps.next) || files.some((f) => /(^|\/)next\.config\.[mc]?[jt]s$/.test(f.path));
  const usesSupabase =
    Object.keys(deps).some((d) => d.startsWith("@supabase/")) ||
    files.some((f) => f.path.startsWith("supabase/"));

  const ctx = { root, files, git: options.git ?? true, isNext, usesSupabase };
  const findings = [
    ...checkSecrets(ctx),
    ...checkAuth(ctx),
    ...checkTenancy(ctx),
    ...checkWebhooks(ctx),
    ...checkHardening(ctx),
    ...checkSupabase(ctx),
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
    usesSupabase,
    generatedAt: new Date().toISOString(),
    findings,
  };
}
