import { collector } from "../items.mjs";

const SQL_CLIENTS = [
  [/^drizzle-orm$/, "Drizzle"],
  [/^prisma$|^@prisma\/client$/, "Prisma"],
  [/^@supabase\/(supabase-js|ssr)$/, "Supabase"],
  [/^kysely$/, "Kysely"],
  [/^knex$/, "Knex"],
  [/^typeorm$/, "TypeORM"],
  [/^sequelize$/, "Sequelize"],
  [
    /^(pg|postgres|mysql2|@neondatabase\/serverless|@vercel\/postgres|@libsql\/client)$/,
    "SQL driver",
  ],
];
const DOCUMENT_DBS = [
  [/^mongoose$|^mongodb$/, "MongoDB"],
  [/^firebase(-admin)?$/, "Firebase"],
  [/^convex$/, "Convex"],
];

const MIGRATION_FILE =
  /(^|\/)(migrations?|drizzle)\/.+\.(sql|[mc]?[jt]s)$|(^|\/)prisma\/migrations\/.+\/migration\.sql$|(^|\/)meta\/_journal\.json$/;
const SEED_FILE = /(^|\/)seeds?(\/.+)?\.(sql|[mc]?[jt]s)$|(^|\/)seeds?\//;

/** Database clients the project depends on. */
export function detectDatabases(ctx) {
  const deps = Object.keys(ctx.deps);
  const pick = (list) => [
    ...new Set(list.filter(([re]) => deps.some((d) => re.test(d))).map(([, n]) => n)),
  ];
  const sql = pick(SQL_CLIENTS);
  if (
    sql.length === 0 &&
    ctx.paths.some((p) => /^supabase\/(config\.toml|migrations\/)/.test(p.path))
  ) {
    sql.push("Supabase");
  }
  const named = sql.length > 1 ? sql.filter((n) => n !== "SQL driver") : sql;
  return { sql: named, document: pick(DOCUMENT_DBS) };
}

/** @param {import("../project.mjs").Context} ctx */
export function checkData(ctx) {
  const { items, pass, warn, manual } = collector("data");
  const { sql, document } = detectDatabases(ctx);
  if (sql.length === 0 && document.length === 0) return items;
  const label = [...sql, ...document].join(", ");

  if (sql.length > 0) {
    // 1. Schema changes are versioned.
    const migrations = ctx.paths.filter((p) => MIGRATION_FILE.test(p.path));
    if (migrations.length > 0) {
      const dir = migrations[0].path.replace(/\/[^/]+$/, "");
      pass(
        "migrations",
        `${migrations.length} migration file${migrations.length === 1 ? "" : "s"} (\`${dir}/\`)`,
      );
    } else {
      const supabase = sql.includes("Supabase");
      warn("migrations", `${label} is used but no migrations are in the repo`, {
        why: supabase
          ? "The schema, RLS policies and functions only exist in the Supabase dashboard: they can't be reviewed, recreated for staging, or handed over with the code."
          : "Schema changes applied by hand (or with `db push`) can't be reviewed, repeated on production or rolled back.",
        fix: supabase
          ? "Run `supabase db pull` (Supabase CLI) to capture the current schema as `supabase/migrations/*.sql`, commit it, and make future changes as migrations."
          : "Generate migrations with your tool (`drizzle-kit generate`, `prisma migrate dev`) and commit them; apply them on deploy (`drizzle-kit migrate`, `prisma migrate deploy`).",
      });
    }

    // 2. Seed data for fresh environments.
    const seedScript = Object.entries(ctx.scripts).find(
      ([name, cmd]) => /seed/i.test(name) || /seed/i.test(String(cmd)),
    );
    const seedFile = ctx.paths.find((p) => SEED_FILE.test(p.path));
    if (seedScript) pass("seed", `Seed script \`${seedScript[0]}\``);
    else if (seedFile) pass("seed", `Seed data present (\`${seedFile.path}\`)`);
    else {
      warn("seed", "No seed script", {
        why: "Every new environment (staging, the client's own account, the next developer's laptop) starts empty, and required rows (plans, roles, settings) get created by hand.",
        fix: 'Add a `"db:seed"` script that creates the required reference data idempotently (and optional demo data for development).',
      });
    }
  }

  // 3. Backups can only be checked by a human.
  manual("backups", `Backups for the production database (${label})`, {
    why: "A bad migration, a delete without `where`, or a compromised key can wipe production. Many free plans keep no backups, or only for a day.",
    fix: "Confirm automated backups are on and how long they are kept (on Supabase, restorable daily backups need a paid plan; on Neon, RDS or others check the retention window), and do one test restore before launch.",
  });
  return items;
}
