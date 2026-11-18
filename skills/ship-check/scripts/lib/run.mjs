import { basename } from "node:path";
import { checkBuild } from "./checks/build.mjs";
import { checkConfig } from "./checks/config.mjs";
import { checkData } from "./checks/data.mjs";
import { checkEmail } from "./checks/email.mjs";
import { checkErrors } from "./checks/errors.mjs";
import { checkLaunch } from "./checks/launch.mjs";
import { checkLegal } from "./checks/legal.mjs";
import { checkObservability } from "./checks/observability.mjs";
import { checkPerformance } from "./checks/performance.mjs";
import { checkSecurity } from "./checks/security.mjs";
import { checkSeo } from "./checks/seo.mjs";
import { AREAS, STATUSES } from "./items.mjs";
import { buildContext } from "./project.mjs";

export const VERDICTS = {
  "not-ready": "Not ready",
  "ready-with-caveats": "Ready with caveats",
  ready: "Ready (pending the manual checks)",
};

/**
 * Runs every check on the project at `rootInput`. The result holds no absolute paths and no
 * environment variable values, so it is safe to share.
 * @param {string} rootInput
 */
export function runShipCheck(rootInput) {
  const ctx = buildContext(rootInput);
  const areaOrder = Object.keys(AREAS);
  const items = [
    ...checkBuild(ctx),
    ...checkConfig(ctx),
    ...checkErrors(ctx),
    ...checkSeo(ctx),
    ...checkPerformance(ctx),
    ...checkSecurity(ctx),
    ...checkObservability(ctx),
    ...checkData(ctx),
    ...checkLegal(ctx),
    ...checkEmail(ctx),
    ...checkLaunch(ctx),
  ].sort(
    (a, b) =>
      areaOrder.indexOf(a.area) - areaOrder.indexOf(b.area) ||
      STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status),
  );

  const summary = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const item of items) summary[item.status]++;
  const verdict =
    summary.fail > 0 ? "not-ready" : summary.warn > 0 ? "ready-with-caveats" : "ready";

  return {
    tool: "ship-check",
    project: ctx.pkg.name ?? basename(ctx.root),
    generatedAt: new Date().toISOString(),
    framework: ctx.isNext
      ? `Next.js${ctx.appDir ? " (App Router)" : ctx.pagesDir ? " (Pages Router)" : ""}`
      : "not Next.js (Next.js-specific checks skipped)",
    packageManager: ctx.packageManager,
    scannedFiles: ctx.files.length,
    verdict,
    summary,
    items,
  };
}
