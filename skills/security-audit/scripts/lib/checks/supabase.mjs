import { lineAt } from "../files.mjs";
import { isSuppressed, snippet } from "../findings.mjs";

const IDENT = String.raw`(?:"?(\w+)"?\.)?"?(\w+)"?`;
const CREATE_TABLE = new RegExp(
  String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${IDENT}`,
  "gi",
);
const DROP_TABLE = new RegExp(String.raw`drop\s+table\s+(?:if\s+exists\s+)?${IDENT}`, "gi");
const RLS = new RegExp(
  String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}\s+(enable|disable)\s+row\s+level\s+security`,
  "gi",
);
const POLICY = new RegExp(
  String.raw`create\s+policy\s+(?:"[^"]+"|\w+)\s+on\s+${IDENT}([\s\S]*?);`,
  "gi",
);

/** @param {{ files: import("../files.mjs").SourceFile[]; usesSupabase: boolean }} ctx */
export function checkSupabase(ctx) {
  if (!ctx.usesSupabase) return [];
  const findings = [];
  const migrations = ctx.files
    .filter((f) => /(^|\/)supabase\/migrations\/.+\.sql$/i.test(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (migrations.length === 0) {
    return [
      {
        check: "supabase-rls-unverified",
        category: "supabase",
        severity: "medium",
        title: "Supabase is used but no migrations were found to verify row level security",
        why: "With Supabase the browser talks to the database directly; tables without RLS are readable and writable by anyone with the public anon key.",
        fix: "In the SQL editor run `select tablename from pg_tables where schemaname = 'public' and not rowsecurity;` — every table listed is exposed. Enable RLS and add policies, and keep the schema in `supabase/migrations`.",
      },
    ];
  }

  /** @type {Map<string, { file: any; index: number; rls: boolean; policies: number }>} */
  const tables = new Map();
  const isPublic = (schema) => !schema || schema.toLowerCase() === "public";

  for (const file of migrations) {
    const events = [];
    for (const m of file.content.matchAll(CREATE_TABLE))
      events.push({ i: m.index, type: "create", m });
    for (const m of file.content.matchAll(DROP_TABLE)) events.push({ i: m.index, type: "drop", m });
    for (const m of file.content.matchAll(RLS)) events.push({ i: m.index, type: "rls", m });
    for (const m of file.content.matchAll(POLICY)) events.push({ i: m.index, type: "policy", m });
    events.sort((a, b) => a.i - b.i);

    for (const { type, m } of events) {
      const [, schema, name] = m;
      if (!isPublic(schema)) continue;
      const key = name.toLowerCase();
      if (type === "create") tables.set(key, { file, index: m.index, rls: false, policies: 0 });
      if (type === "drop") tables.delete(key);
      const table = tables.get(key);
      if (!table) continue;
      if (type === "rls") table.rls = m[3].toLowerCase() === "enable";
      if (type === "policy") {
        table.policies++;
        const body = m[3] ?? "";
        const permissive = /using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(body);
        if (!permissive) continue;
        const readOnly = /\bfor\s+select\b/i.test(body);
        const line = lineAt(file.content, m.index);
        if (isSuppressed(file, line, "supabase-permissive-policy")) continue;
        findings.push({
          check: "supabase-permissive-policy",
          category: "supabase",
          severity: readOnly ? "medium" : "high",
          title: `Policy on \`${name}\` allows ${readOnly ? "anyone to read every row" : "anyone to change every row"} (\`true\`)`,
          file: file.path,
          line,
          snippet: snippet(file, line),
          why: "`using (true)` / `with check (true)` applies to every row for every caller, which is the same as having no policy for that operation.",
          fix: readOnly
            ? "If the data is truly public (e.g. a product catalog) keep it and add `-- security-audit-ignore supabase-permissive-policy`; otherwise filter by `auth.uid()` or organization membership."
            : "Restrict to the owner or organization, e.g. `using (auth.uid() = user_id)` / `using (organization_id in (select organization_id from members where user_id = auth.uid()))`.",
        });
      }
    }
  }

  for (const [name, table] of tables) {
    const line = lineAt(table.file.content, table.index);
    if (!table.rls) {
      if (isSuppressed(table.file, line, "supabase-rls-disabled")) continue;
      findings.push({
        check: "supabase-rls-disabled",
        category: "supabase",
        severity: "high",
        title: `Table \`${name}\` does not have row level security enabled`,
        file: table.file.path,
        line,
        snippet: snippet(table.file, line),
        why: "Anyone with your public anon key (it ships in the browser) can read, insert, update and delete every row.",
        fix: `\`alter table public.${name} enable row level security;\` then add policies scoped to \`auth.uid()\` or organization membership.`,
      });
    } else if (table.policies === 0) {
      if (isSuppressed(table.file, line, "supabase-rls-no-policies")) continue;
      findings.push({
        check: "supabase-rls-no-policies",
        category: "supabase",
        severity: "low",
        title: `Table \`${name}\` has RLS enabled but no policies`,
        file: table.file.path,
        line,
        snippet: snippet(table.file, line),
        why: "No policies means deny-all for client access. That is safe, but usually unintended if the app reads it from the browser.",
        fix: "Confirm only server code (service role) uses this table, or add the policies the app needs.",
      });
    }
  }
  return findings;
}
