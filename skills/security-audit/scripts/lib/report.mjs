import { CATEGORIES, SEVERITIES } from "./findings.mjs";

const BADGE = { high: "🔴 HIGH", medium: "🟠 MEDIUM", low: "🟡 LOW" };

/** @param {ReturnType<typeof import("./audit.mjs").runAudit>} result */
export function toMarkdown(result) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of result.findings) counts[f.severity]++;

  const out = [
    "# Security audit report",
    "",
    `- **Project:** ${result.project}`,
    `- **Generated:** ${result.generatedAt}`,
    `- **Files scanned:** ${result.scannedFiles}${result.isNext ? " (Next.js)" : ""}${result.usesSupabase ? " · Supabase" : ""}`,
    "",
    "| Severity | Findings |",
    "| --- | --- |",
    ...SEVERITIES.map((s) => `| ${BADGE[s]} | ${counts[s]} |`),
    "",
    "> Automated static checks find likely problems; each finding should be confirmed by reading the code. A clean report does not prove the app is secure.",
    "",
  ];

  for (const [category, label] of Object.entries(CATEGORIES)) {
    const items = result.findings.filter((f) => f.category === category);
    out.push(`## ${label}`, "");
    if (category === "supabase" && !result.usesSupabase) {
      out.push("Not applicable — Supabase is not used.", "");
      continue;
    }
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

export function toJson(result) {
  return JSON.stringify(result, null, 2);
}
