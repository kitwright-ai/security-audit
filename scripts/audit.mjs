#!/usr/bin/env node
// Kitwright security audit — static checks for Next.js projects. MIT License.
// Usage: node audit.mjs [path] [--out report.md] [--json] [--fail-on high|medium|low] [--no-git]
import { writeFileSync } from "node:fs";
import { runAudit } from "./lib/audit.mjs";
import { SEVERITIES } from "./lib/findings.mjs";
import { toJson, toMarkdown } from "./lib/report.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args[i + 1] ?? "");
};
const path =
  args.find((a, i) => !a.startsWith("--") && !["--out", "--fail-on"].includes(args[i - 1] ?? "")) ??
  ".";
const failOn = flag("--fail-on");
if (failOn !== undefined && !SEVERITIES.includes(failOn)) {
  console.error(`--fail-on must be one of: ${SEVERITIES.join(", ")}`);
  process.exit(2);
}

const result = runAudit(path, { git: !args.includes("--no-git") });
const output = args.includes("--json") ? toJson(result) : toMarkdown(result);
const out = flag("--out");
if (out) {
  writeFileSync(out, output);
  console.error(`Report written to ${out} (${result.findings.length} findings)`);
} else {
  process.stdout.write(`${output}\n`);
}

if (failOn) {
  const threshold = SEVERITIES.indexOf(failOn);
  const failing = result.findings.filter((f) => SEVERITIES.indexOf(f.severity) <= threshold);
  process.exit(failing.length > 0 ? 1 : 0);
}
