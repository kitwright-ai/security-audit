import { AREAS, STATUSES } from "./items.mjs";
import { VERDICTS } from "./run.mjs";

const BADGE = { fail: "❌ FAIL", warn: "⚠️ WARN", manual: "🖐 MANUAL", pass: "✅ PASS" };

const where = (loc) => `\`${loc.file}${loc.line ? `:${loc.line}` : ""}\``;

/** @param {import("./items.mjs").Item} item */
function renderDetailed(item) {
  const out = [`### ${BADGE[item.status]} — ${item.title}`, ""];
  if (item.locations) {
    for (const loc of item.locations) {
      out.push(`- ${where(loc)}${loc.snippet ? ` — \`${loc.snippet.replace(/`/g, "'")}\`` : ""}`);
    }
    out.push("");
  } else if (item.file) {
    out.push(where(item), "");
    if (item.snippet) out.push("```", item.snippet, "```", "");
  }
  if (item.why) out.push(`**Why it matters:** ${item.why}`, "");
  if (item.fix) out.push(`**Fix:** ${item.fix}`, "");
  out.push(`<sub>check: \`${item.check}\`</sub>`, "");
  return out;
}

/** @param {ReturnType<typeof import("./run.mjs").runShipCheck>} result */
export function toMarkdown(result) {
  const { summary } = result;
  const out = [
    "# Ship check report",
    "",
    `- **Project:** ${result.project}`,
    `- **Generated:** ${result.generatedAt}`,
    `- **Framework:** ${result.framework} · **Package manager:** ${result.packageManager}`,
    `- **Files scanned:** ${result.scannedFiles}`,
    "",
    `**Automated verdict: ${VERDICTS[result.verdict]}** — ${summary.fail} blocker${summary.fail === 1 ? "" : "s"}, ${summary.warn} warning${summary.warn === 1 ? "" : "s"}, ${summary.manual} manual check${summary.manual === 1 ? "" : "s"}, ${summary.pass} passed.`,
    "",
    "| Status | Items |",
    "| --- | --- |",
    ...STATUSES.map((s) => `| ${BADGE[s]} | ${summary[s]} |`),
    "",
    "> Static checks only. Confirm each FAIL and WARN by reading the code, run the real build, lint, typecheck and tests, and go through the MANUAL items with whoever owns the hosting and domain. For security, run the security-audit skill.",
    "",
  ];

  const blockers = result.items.filter((i) => i.status === "fail");
  if (blockers.length > 0) {
    out.push("## Blockers", "");
    for (const b of blockers) out.push(`- ${b.title}${b.file ? ` (${where(b)})` : ""}`);
    out.push("");
  }

  for (const [area, label] of Object.entries(AREAS)) {
    const items = result.items.filter((i) => i.area === area);
    out.push(`## ${label}`, "");
    if (items.length === 0) {
      out.push("Not applicable to this project.", "");
      continue;
    }
    for (const item of items.filter((i) => i.status === "fail" || i.status === "warn")) {
      out.push(...renderDetailed(item));
    }
    const manual = items.filter((i) => i.status === "manual");
    for (const item of manual) {
      out.push(`- [ ] ${BADGE.manual} **${item.title}** — ${item.why} *How:* ${item.fix}`);
    }
    if (manual.length > 0) out.push("");
    const passed = items.filter((i) => i.status === "pass");
    for (const item of passed) out.push(`- ${BADGE.pass} ${item.title}`);
    if (passed.length > 0) out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

export function toJson(result) {
  return JSON.stringify(result, null, 2);
}
