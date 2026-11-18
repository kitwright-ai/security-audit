import { CATEGORIES, SEVERITIES } from "./findings.mjs";

const BADGE = { high: "🔴 HIGH", medium: "🟠 MEDIUM", low: "🟡 LOW" };

function stripeSummary(result) {
  if (!result.usesStripe) return "not detected";
  const parts = ["detected"];
  parts.push(
    result.webhookRoutes.length > 0
      ? `webhook ${result.webhookRoutes.map((r) => `\`${r}\``).join(", ")}`
      : "no webhook route found",
  );
  if (result.usesSubscriptions) parts.push("subscriptions");
  return parts.join(" · ");
}

/** @param {ReturnType<typeof import("./audit.mjs").runAudit>} result */
export function toMarkdown(result) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of result.findings) counts[f.severity]++;

  const out = [
    "# Stripe audit report",
    "",
    `- **Project:** ${result.project}`,
    `- **Generated:** ${result.generatedAt}`,
    `- **Files scanned:** ${result.scannedFiles}${result.isNext ? " (Next.js)" : ""}`,
    `- **Stripe:** ${stripeSummary(result)}`,
    "",
    "| Severity | Findings |",
    "| --- | --- |",
    ...SEVERITIES.map((s) => `| ${BADGE[s]} | ${counts[s]} |`),
    "",
    "> Automated static checks find likely problems; each finding should be confirmed by tracing the payment flow in the code. A clean report does not prove the integration is correct — Dashboard settings (webhook events, test vs live mode, Customer Portal) are not visible to the scanner.",
    "",
  ];

  if (!result.usesStripe) {
    out.push(
      "Stripe is not used in this project (no `stripe` dependency or Stripe API calls).",
      "",
    );
  }

  for (const [category, label] of Object.entries(CATEGORIES)) {
    const items = result.findings.filter((f) => f.category === category);
    out.push(`## ${label}`, "");
    if (items.length === 0) {
      out.push("✅ No issues found.", "");
      continue;
    }
    for (const f of items) {
      out.push(`### ${BADGE[f.severity]} — ${f.title}`, "");
      if (f.file) out.push(`\`${f.file}${f.line ? `:${f.line}` : ""}\``, "");
      if (f.snippet) out.push("```", f.snippet, "```", "");
      out.push(
        `**Why it matters:** ${f.why}`,
        "",
        `**Fix:** ${f.fix}`,
        "",
        `<sub>check: \`${f.check}\`</sub>`,
        "",
      );
    }
  }
  return out.join("\n");
}

/** JSON output. The absolute project path is left out so reports can be shared. */
export function toJson(result) {
  const { root: _root, ...rest } = result;
  return JSON.stringify(rest, null, 2);
}
