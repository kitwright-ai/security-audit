#!/usr/bin/env node
// Kitwright env hardening: finds every env variable a Next.js app reads and drafts a validated
// env.ts. MIT License. Read-only unless you pass --out, --emit-env or --emit-example.
//
// Usage: node scan.mjs [path] [--json] [--out report.md] [--emit-env src/env.ts]
//                      [--emit-example .env.example] [--force] [--fail-on high|medium|low]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { SEVERITIES } from "./lib/checks.mjs";
import { ENV_FILE, ENV_TEMPLATE } from "./lib/files.mjs";
import { toJson, toMarkdown } from "./lib/report.mjs";
import { runScan } from "./lib/scan.mjs";

const VALUE_FLAGS = ["--out", "--emit-env", "--emit-example", "--fail-on"];
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args[i + 1] ?? "");
};
const fail = (message) => {
  console.error(message);
  process.exit(2);
};

const path = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1] ?? ""));
const failOn = flag("--fail-on");
if (failOn !== undefined && !SEVERITIES.includes(failOn)) {
  fail(`--fail-on must be one of: ${SEVERITIES.join(", ")}`);
}
for (const name of VALUE_FLAGS) {
  if (args.includes(name) && !flag(name)) fail(`${name} needs a value`);
}

let result;
try {
  result = runScan(path ?? ".");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const write = (file, content) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

const emitEnv = flag("--emit-env");
if (emitEnv) {
  if (existsSync(emitEnv) && !args.includes("--force")) {
    fail(`${emitEnv} already exists; pass --force to overwrite it.`);
  }
  write(emitEnv, result.draft.envTs);
  console.error(`Draft env.ts written to ${emitEnv}`);
}

const emitExample = flag("--emit-example");
if (emitExample) {
  const name = basename(emitExample);
  if (ENV_FILE.test(name) && !ENV_TEMPLATE.test(name)) {
    fail(`Refusing to write to ${emitExample}: it looks like a real env file, not a template.`);
  }
  if (!result.draft.envExample) {
    console.error("Nothing to add: every variable read in code is already documented.");
  } else if (existsSync(emitExample)) {
    const current = readFileSync(emitExample, "utf8");
    appendFileSync(
      emitExample,
      `${current.endsWith("\n") || current === "" ? "" : "\n"}\n${result.draft.envExample}`,
    );
    console.error(`Missing names appended to ${emitExample}`);
  } else {
    write(emitExample, result.draft.envExample);
    console.error(`${emitExample} created`);
  }
}

const output = args.includes("--json") ? toJson(result) : toMarkdown(result);
const out = flag("--out");
if (out) {
  write(out, `${output}\n`);
  console.error(`Report written to ${out} (${result.problems.length} problems)`);
} else if (!emitEnv && !emitExample) {
  process.stdout.write(`${output}\n`);
}

if (failOn) {
  const threshold = SEVERITIES.indexOf(failOn);
  const failing = result.problems.filter((p) => SEVERITIES.indexOf(p.severity) <= threshold);
  process.exit(failing.length > 0 ? 1 : 0);
}
