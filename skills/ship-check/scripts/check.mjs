#!/usr/bin/env node
// Kitwright ship check — production-readiness checklist for Next.js projects. MIT License.
// Usage: node check.mjs [path] [--out report.md] [--json] [--fail-on fail|warn]
import { writeFileSync } from "node:fs";
import { STATUSES } from "./lib/items.mjs";
import { toJson, toMarkdown } from "./lib/report.mjs";
import { runShipCheck } from "./lib/run.mjs";

const FAIL_ON = ["fail", "warn"];
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args[i + 1] ?? "");
};
const path =
  args.find((a, i) => !a.startsWith("--") && !["--out", "--fail-on"].includes(args[i - 1] ?? "")) ??
  ".";
const failOn = flag("--fail-on");
if (failOn !== undefined && !FAIL_ON.includes(failOn)) {
  console.error(`--fail-on must be one of: ${FAIL_ON.join(", ")}`);
  process.exit(2);
}

let result;
try {
  result = runShipCheck(path);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
const output = args.includes("--json") ? toJson(result) : toMarkdown(result);
const out = flag("--out");
if (out) {
  writeFileSync(out, output.endsWith("\n") ? output : `${output}\n`);
  const s = result.summary;
  console.error(
    `Report written to ${out} (${s.fail} fail, ${s.warn} warn, ${s.manual} manual, ${s.pass} pass)`,
  );
} else {
  process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
}

if (failOn) {
  const threshold = STATUSES.indexOf(failOn);
  const failing = result.items.filter((i) => STATUSES.indexOf(i.status) <= threshold);
  process.exit(failing.length > 0 ? 1 : 0);
}
