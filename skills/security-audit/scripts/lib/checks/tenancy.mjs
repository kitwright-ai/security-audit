import {
  blockFrom,
  isClientFile,
  isRouteFile,
  isServerActionFile,
  isTestFile,
  lineAt,
} from "../files.mjs";
import { isSuppressed, snippet } from "../findings.mjs";

const TENANT_MARKERS =
  /organizationId|organization_id|orgId|org_id|tenantId|tenant_id|workspaceId|workspace_id|teamId|team_id|accountId|account_id|userId|user_id|ownerId|owner_id|createdBy|created_by|authorId|author_id|session\.user|ctx\.user|\bscoped\w*\(|forOrganization|forTenant|withTenant/;

/** Tables that are global by design or managed by the auth provider. */
const GLOBAL_TABLE =
  /^(plans?|products?|prices?|pricing|countries|currencies|settings|config|features?|migrations?|webhook_?events?|\w*WebhookEvents?|verifications?|sessions?|accounts?|users?|organizations?|members?|invitations?|rate_?limits?|auditLog|audit_?logs?|categories|tags|translations|locales)$/i;

const SKIP_PATH =
  /(^|\/)(seed|seeds|migrations?|scripts|drizzle|prisma\/seed)(\/|\.|$)|\.config\.[mc]?[jt]s$/;

/** Server-side files where data access happens. */
function isServerCode(file) {
  if (isTestFile(file.path) || SKIP_PATH.test(file.path) || isClientFile(file)) return false;
  return (
    isRouteFile(file.path) ||
    isServerActionFile(file) ||
    /["']server-only["']/.test(file.content) ||
    /(^|\/)(lib|server|services?|data|queries|repositories|db|actions|app)\//.test(file.path)
  );
}

const PATTERNS = [
  // Drizzle
  { re: /\.select\((?:[^()]|\([^()]*\))*\)\s*\.from\(\s*([A-Za-z_$][\w$]*)\s*\)/g, kind: "read" },
  {
    re: /\b(?:db|tx|trx|database)\s*\.\s*(update|delete)\(\s*([A-Za-z_$][\w$]*)\s*\)/g,
    kind: "write",
    table: 2,
  },
  { re: /\b(?:db|tx|trx)\.query\.([A-Za-z_$][\w$]*)\.find(?:Many|First)\(/g, kind: "read" },
  // Prisma
  {
    re: /\b(?:prisma|db|tx)\.([a-z][\w$]*)\.(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|update|updateMany|delete|deleteMany|upsert|count|aggregate|groupBy)\(/g,
    kind: "prisma",
  },
  // Raw SQL in tagged templates
  { re: /\b(?:sql|query|execute)\s*`\s*(select|update|delete)\b[\s\S]*?`/gi, kind: "raw" },
];

function statementAt(content, index) {
  // Up to the end of the statement (next `;` at depth 0, or 1200 chars).
  let depth = 0;
  let end = Math.min(content.length, index + 1200);
  for (let i = index; i < end; i++) {
    const ch = content[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    if (ch === ")" || ch === "}" || ch === "]") depth--;
    if (depth < 0 || (depth === 0 && ch === ";")) {
      end = i;
      break;
    }
  }
  // Include the start of the chain (`await db.select(...)` / `const where = ...` just above).
  return content.slice(Math.max(0, index - 200), end);
}

/** @param {{ files: import("../files.mjs").SourceFile[] }} ctx */
export function checkTenancy(ctx) {
  const findings = [];
  for (const file of ctx.files) {
    if (!isServerCode(file)) continue;
    for (const pattern of PATTERNS) {
      for (const m of file.content.matchAll(pattern.re)) {
        const table = pattern.kind === "raw" ? null : m[pattern.table ?? 1];
        if (table && GLOBAL_TABLE.test(table)) continue;
        if (pattern.kind === "raw") {
          if (!/\bfrom\b|\bupdate\b|\bdelete\b/i.test(m[0])) continue;
          const tableName = /\b(?:from|update|into)\s+"?(\w+)"?/i.exec(m[0])?.[1];
          if (tableName && GLOBAL_TABLE.test(tableName)) continue;
          if (TENANT_MARKERS.test(m[0])) continue;
        } else if (TENANT_MARKERS.test(statementAt(file.content, m.index))) {
          continue;
        }
        // A `where` built earlier in the same function (`const where = scoped(...)`) also counts.
        const fn = enclosingFunction(file.content, m.index);
        if (
          fn &&
          pattern.kind !== "raw" &&
          /\bwhere\b/.test(statementAt(file.content, m.index)) &&
          TENANT_MARKERS.test(fn)
        ) {
          continue;
        }
        const line = lineAt(file.content, m.index);
        if (isSuppressed(file, line, "query-without-tenant-filter")) continue;
        const action =
          pattern.kind === "write" ? m[1] : pattern.kind === "raw" ? m[1].toLowerCase() : "read";
        findings.push({
          check: "query-without-tenant-filter",
          category: "tenancy",
          severity:
            /update|delete/i.test(action) || /update|delete|upsert/.test(m[2] ?? "")
              ? "high"
              : "medium",
          title: `Query on \`${table ?? "raw SQL"}\` is not filtered by organization or user`,
          file: file.path,
          line,
          snippet: snippet(file, line),
          why: "Without an organization/user filter, one customer can read or change another customer's data by guessing or changing an id (IDOR).",
          fix: "Always filter by the tenant from the session, e.g. `where(scoped(table, organizationId, eq(table.id, id)))` or `where: { id, organizationId }`. If the table is global, add `// security-audit-ignore query-without-tenant-filter <reason>`.",
        });
      }
    }
  }
  return findings;
}

/** Body of the function that contains `index` (best effort). */
function enclosingFunction(content, index) {
  const before = content.slice(0, index);
  const re = /(?:function\s*\w*\s*\([^)]*\)[^{]*|=>\s*)\{/g;
  let last = null;
  for (const m of before.matchAll(re)) last = m;
  if (!last) return null;
  const body = blockFrom(content, last.index + last[0].length - 1);
  return last.index + body.length > index ? body : null;
}
