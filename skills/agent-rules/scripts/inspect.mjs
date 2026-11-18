#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { inspectProject } from "./lib/inspect.mjs";
import { toJson, toMarkdown } from "./lib/report.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node inspect.mjs [project-path] [--json] [--out file]");
  process.exit(0);
}
const outIndex = args.indexOf("--out");
const out = outIndex === -1 ? undefined : args[outIndex + 1];
if (outIndex !== -1 && !out) {
  console.error("--out needs a file name");
  process.exit(2);
}
const path =
  args.find((a, i) => !a.startsWith("--") && (outIndex === -1 || i !== outIndex + 1)) ?? ".";

let result;
try {
  result = inspectProject(path);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
const output = args.includes("--json") ? toJson(result) : toMarkdown(result);
if (out) {
  writeFileSync(out, `${output}\n`);
  console.error(`Project facts written to ${out}`);
} else {
  process.stdout.write(`${output}\n`);
}
