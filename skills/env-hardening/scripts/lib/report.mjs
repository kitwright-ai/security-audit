import { SEVERITIES } from "./checks.mjs";

const BADGE = { high: "🔴 HIGH", medium: "🟠 MEDIUM", low: "🟡 LOW" };
const SIDE = { server: "server", client: "client (browser)", shared: "shared" };
const MAX_LOCATIONS = 4;

/** @param {ReturnType<typeof import("./scan.mjs").runScan>} result */
export function toMarkdown(result) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const p of result.problems) counts[p.severity]++;
  const read = result.variables.filter((v) => v.readInCode);
  const bySide = (side) => read.filter((v) => v.side === side).length;

  const validation = result.validation.detected
    ? result.validation.modules.map((m) => `\`${m.file}\` (${m.kind})`).join(", ")
    : "none found";

  const out = [
    "# Env hardening report",
    "",
    `- **Project:** ${result.project}`,
    `- **Generated:** ${result.generatedAt}`,
    `- **Files scanned:** ${result.scannedFiles}${result.isNext ? " (Next.js)" : ""}`,
    `- **Variables read in code:** ${read.length} (${bySide("server")} server, ${bySide("client")} client, ${bySide("shared")} shared)`,
    `- **Validation module:** ${validation}`,
    `- **zod:** ${result.zodInstalled ? "installed" : `not installed (\`${addCommand(result.packageManager)}\`)`}`,
    "",
    "| Severity | Problems |",
    "| --- | --- |",
    ...SEVERITIES.map((s) => `| ${BADGE[s]} | ${counts[s]} |`),
    "",
    "> Static checks find likely problems; confirm each one in the code. Values from `.env` files are never read into this report: only variable names.",
    "",
    "## Problems",
    "",
  ];

  if (result.problems.length === 0) out.push("✅ No problems found.", "");
  for (const p of result.problems) {
    out.push(`### ${BADGE[p.severity]} — ${p.title}`, "");
    if (p.file) out.push(`\`${p.file}${p.line ? `:${p.line}` : ""}\``, "");
    if (p.snippet) out.push("```", p.snippet, "```", "");
    out.push(
      `**Why it matters:** ${p.why}`,
      "",
      `**Fix:** ${p.fix}`,
      "",
      `<sub>check: \`${p.check}\`</sub>`,
      "",
    );
  }

  out.push("## Variables", "");
  if (result.variables.length === 0) {
    out.push("No environment variables found.", "");
  } else {
    out.push(
      "| Variable | Side | Read in | .env.example | Locations |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const v of result.variables) {
      const locations = [...new Set(v.usages.map((u) => `\`${u.file}:${u.line}\``))];
      const shown = locations.slice(0, MAX_LOCATIONS).join(", ");
      const more =
        locations.length > MAX_LOCATIONS ? ` +${locations.length - MAX_LOCATIONS} more` : "";
      out.push(
        `| \`${v.name}\` | ${SIDE[v.side]} | ${v.contexts.join(", ") || "—"} | ${v.inExample ? "yes" : "no"} | ${shown || `only in ${v.definedIn.join(", ")}`}${more} |`,
      );
    }
    out.push("");
  }

  if (result.notes.length > 0) {
    out.push("## Public by design", "");
    for (const n of result.notes) out.push(`- \`${n.name}\`: ${n.note}`);
    out.push("");
  }

  out.push(
    `## Draft \`${result.suggestedEnvPath}\``,
    "",
    "Generated from the names above with conservative types. Review every schema against how the variable is used before adopting it.",
    "",
  );
  if (result.draft.notes.length > 0) {
    for (const note of result.draft.notes) out.push(`- ${note}`);
    out.push("");
  }
  out.push("```ts", result.draft.envTs.trimEnd(), "```", "");

  out.push("## Draft `.env.example` additions", "");
  if (result.draft.envExample) {
    out.push("```dotenv", result.draft.envExample.trimEnd(), "```", "");
  } else {
    out.push("✅ Every variable read in code is already in .env.example.", "");
  }
  return out.join("\n");
}

export function addCommand(pm) {
  return pm === "npm" ? "npm install zod" : `${pm} add zod`;
}

export function toJson(result) {
  return JSON.stringify(result, null, 2);
}
