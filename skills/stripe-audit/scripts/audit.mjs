#!/usr/bin/env node
// Kitwright Stripe audit — static checks for Stripe integrations in Next.js. MIT License.
// Usage: node audit.mjs [path] [--out report.md] [--json] [--fail-on high|medium|low]
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

let result;
try {
  result = runAudit(path);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
}
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
