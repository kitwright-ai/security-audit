import { CATEGORIES } from "./catalog.mjs";

const code = (s) => `\`${s}\``;
const list = (items, empty = "none found") =>
  items.length ? items.map(code).join(", ") : `_${empty}_`;
const yesNo = (v) => (v === true ? "yes" : v === false ? "no" : "not set");
const MAX_LISTED = 25;

function capped(items) {
  const shown = items.slice(0, MAX_LISTED).map((i) => `  - ${code(i)}`);
  if (items.length > MAX_LISTED) shown.push(`  - … and ${items.length - MAX_LISTED} more`);
  return shown;
}

/** @param {ReturnType<typeof import("./inspect.mjs").inspectProject>} r */
export function toMarkdown(r) {
  const pm = r.packageManager;
  const ws = r.workspaces;
  const ts = r.typescript;
  const s = r.structure;
  const out = [
    `# Project facts: ${r.project}`,
    "",
    `- **Generated:** ${r.generatedAt}`,
    `- **Source files scanned:** ${r.sourceFiles}`,
    "",
    "> Detected from package.json, config files and file layout. Confirm anything that matters by reading the code before writing it into AGENTS.md.",
    "",
    "## Tooling",
    "",
    `- **Package manager:** ${pm.name} (${pm.lockfile ? `lockfile ${code(pm.lockfile)}` : pm.source})`,
    `- **Monorepo:** ${
      ws.monorepo
        ? `yes, ${ws.tool}${ws.orchestrators.length ? ` + ${ws.orchestrators.join(", ")}` : ""}; ${
            ws.isWorkspaceRoot
              ? "this is the workspace root"
              : `workspace root at ${code(ws.workspaceRoot)}`
          }${ws.patterns.length ? ` (${list(ws.patterns)})` : ""}`
        : "no"
    }`,
    `- **Node:** ${r.node.engine ? `engines ${code(r.node.engine)}` : "no engines field"}${
      r.node.nvmrc ? `, .nvmrc ${code(r.node.nvmrc)}` : ""
    }`,
    "",
    "## Stack",
    "",
    "| Package | Version |",
    "| --- | --- |",
    ...Object.entries(r.versions).map(([k, v]) => `| ${k} | ${v ? code(v) : "—"} |`),
    "",
  ];

  if (ts) {
    out.push(
      `**TypeScript** (${code(ts.file)}${ts.extendsPackage ? `, extends ${code(ts.extendsPackage)}` : ""}): ` +
        `strict ${yesNo(ts.strict)} · noUncheckedIndexedAccess ${yesNo(ts.noUncheckedIndexedAccess)} · ` +
        `exactOptionalPropertyTypes ${yesNo(ts.exactOptionalPropertyTypes)}`,
      "",
    );
    const aliases = Object.entries(ts.paths);
    if (aliases.length) {
      out.push(
        `Path aliases: ${aliases.map(([k, v]) => `${code(k)} → ${code(v)}`).join(", ")}`,
        "",
      );
    }
  } else {
    out.push("**TypeScript:** no tsconfig.json found.", "");
  }

  const rt = r.router;
  out.push(
    "## Next.js layout",
    "",
    `- **Router:** ${rt.type}${rt.app ? ` — App Router in ${code(`${rt.app}/`)}` : ""}${
      rt.pages ? ` — Pages Router in ${code(`${rt.pages}/`)}` : ""
    }`,
    `- **src/ directory:** ${rt.srcDir ? "yes" : "no"}`,
    `- **middleware:** ${rt.middleware ? code(rt.middleware) : "none"} · **proxy:** ${
      rt.proxy ? code(rt.proxy) : "none"
    }`,
    `- **next.config:** ${rt.nextConfig ? code(rt.nextConfig) : "none"}`,
    `- **Client components (\`"use client"\`):** ${s.clientComponents}`,
    "",
    "## Libraries",
    "",
  );
  const cats = Object.entries(CATEGORIES).filter(([key]) => r.libraries[key]?.length);
  if (cats.length === 0) out.push("_No known libraries detected._", "");
  else {
    out.push("| Area | Detected |", "| --- | --- |");
    for (const [key, label] of cats) {
      const libs = (r.libraries[key] ?? []).map(
        (l) =>
          `${l.label} (${l.packages.map((p) => `${code(`${p.name}@${p.version}`)}${p.dev ? " dev" : ""}`).join(", ")})`,
      );
      out.push(`| ${label} | ${libs.join("; ")} |`);
    }
    out.push("");
  }
  const sh = r.other.shadcn;
  if (sh) {
    out.push(
      `**shadcn/ui** (${code("components.json")}): style ${code(sh.style ?? "?")}, base color ${code(sh.baseColor ?? "?")}, CSS variables ${yesNo(sh.cssVariables)}` +
        (Object.keys(sh.aliases).length
          ? `, aliases ${Object.entries(sh.aliases)
              .map(([k, v]) => `${k} → ${code(v)}`)
              .join(", ")}`
          : ""),
      "",
    );
  }
  if (r.other.tailwindConfig) out.push(`Tailwind config: ${code(r.other.tailwindConfig)}`, "");

  out.push("## Scripts", "");
  if (r.scripts.length === 0) out.push("_No scripts in package.json._", "");
  else {
    out.push("| Script | Run with | Command | Kind |", "| --- | --- | --- | --- |");
    for (const sc of r.scripts) {
      out.push(
        `| ${sc.name} | ${code(sc.run)} | ${code(sc.command.replace(/\|/g, "\\|"))} | ${sc.kind ?? ""} |`,
      );
    }
    out.push("");
  }
  if (r.workspaceScripts.length) {
    out.push(
      `**Workspace root scripts** (run in ${code(r.workspaces.workspaceRoot)}):`,
      "",
      "| Script | Run with | Command |",
      "| --- | --- | --- |",
      ...r.workspaceScripts.map(
        (sc) => `| ${sc.name} | ${code(sc.run)} | ${code(sc.command.replace(/\|/g, "\\|"))} |`,
      ),
      "",
    );
    const sample = r.scripts.find((sc) => sc.fromRoot);
    if (sample)
      out.push(
        `From the workspace root, run this package's scripts with ${code(sample.fromRoot)}.`,
        "",
      );
  }
  out.push("**Suggested “before finishing a task” checks:**", "");
  if (r.checks.length === 0)
    out.push("_None available — ask the user how they verify changes._", "");
  else {
    out.push(
      ...r.checks.map(
        (c) =>
          `- ${code(c.command)} — ${c.step} (${c.source}${c.cwd === "." ? "" : `; run in ${code(c.cwd)}`})`,
      ),
      "",
    );
  }

  out.push("## Project structure", "", "```");
  for (const d of s.tree) {
    out.push(d.path);
    for (const c of d.children) out.push(`  ${c}`);
    if (d.more) out.push(`  … ${d.more} more`);
  }
  out.push("```", "");
  out.push(
    `- **Route handlers (${s.routeHandlers.length}):**`,
    ...capped(s.routeHandlers),
    `- **Server action files (\`"use server"\` at top) (${s.serverActions.files.length}):** ${list(s.serverActions.files.slice(0, MAX_LISTED))}`,
    `- **Inline server actions in:** ${list(s.serverActions.inline.slice(0, MAX_LISTED))}`,
    `- **DB schema / config:** ${list(s.schema)}`,
    `- **Migrations:** ${list(s.migrations)}`,
    `- **Components:** ${list(s.components)}`,
    `- **lib / server code:** ${list(s.lib)}`,
    `- **Tests:** ${s.tests.count} file(s)${s.tests.count ? ` in ${list(s.tests.dirs)}${s.tests.colocated ? " (colocated)" : ""}` : ""}${
      s.tests.e2eDirs.length ? `; e2e in ${list(s.tests.e2eDirs)}` : ""
    }`,
    "",
  );

  const env = r.env;
  out.push(
    "## Environment variables",
    "",
    "> Names only. Values are never read or printed.",
    "",
    `- **Documented in:** ${list(env.exampleFiles)}`,
    `- **Local env files present (not read):** ${list(env.localFiles)}`,
    `- **Validation module:** ${
      env.validation
        ? `${code(env.validation.file)}${env.validation.library ? ` (${env.validation.library})` : ""}`
        : "_none found_"
    }`,
    `- **Files reading \`process.env\` directly (${env.directProcessEnv.length}):** ${list(env.directProcessEnv.slice(0, MAX_LISTED))}`,
    "",
  );
  if (env.names.length) {
    out.push("| Name | Exposed to browser | Source |", "| --- | --- | --- |");
    for (const v of env.names)
      out.push(`| ${code(v.name)} | ${v.public ? "yes" : "no"} | ${v.file} |`);
    out.push("");
  }

  out.push("## Existing agent instructions", "");
  if (r.agentFiles.length === 0)
    out.push("_None — AGENTS.md and CLAUDE.md can be created fresh._", "");
  else {
    out.push("Merge with these instead of overwriting them:", "");
    for (const f of r.agentFiles) {
      out.push(
        `- ${code(f.path)} — ${f.lines} lines${f.imports.length ? `; imports ${list(f.imports)}` : ""}${
          f.headings.length ? `; sections: ${f.headings.join(" · ")}` : ""
        }`,
      );
    }
    out.push("");
  }
  if (r.workspaceAgentFiles.length) {
    out.push(
      "Agent files at the workspace root also apply to this project:",
      "",
      ...r.workspaceAgentFiles.map((f) => `- ${code(f.path)} — ${f.lines} lines`),
      "",
    );
  }

  out.push(
    "## Other",
    "",
    `- **CI workflows:** ${list(r.other.ci)}`,
    `- **Deploy config:** ${r.other.deploy.length ? r.other.deploy.map((d) => `${d.name} (${code(d.file)})`).join(", ") : "_none found_"}`,
    "",
    "## Gaps worth asking about",
    "",
    ...(r.gaps.length ? r.gaps.map((g) => `- ${g}`) : ["_None detected._"]),
    "",
  );
  return out.join("\n");
}

export function toJson(result) {
  return JSON.stringify(result, null, 2);
}
