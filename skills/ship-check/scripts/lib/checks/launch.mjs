import { collector } from "../items.mjs";
import { envReferences } from "./config.mjs";
import { detectDatabases } from "./data.mjs";

const AUTH_LIBS = [
  [/^@supabase\//, "Supabase Auth"],
  [/^next-auth$|^@auth\//, "Auth.js"],
  [/^better-auth$/, "Better Auth"],
  [/^@clerk\//, "Clerk"],
  [/^@kinde-oss\//, "Kinde"],
  [/^lucia$/, "Lucia"],
  [/^firebase$/, "Firebase Auth"],
];

/**
 * Items only a human with access to the hosting, DNS and provider dashboards can confirm.
 * @param {import("../project.mjs").Context} ctx
 */
export function checkLaunch(ctx) {
  const { items, manual } = collector("launch");
  const deps = Object.keys(ctx.deps);
  const uses = (re) => deps.some((d) => re.test(d));

  manual("domain-https", "Custom domain with HTTPS, and the other hostname redirects", {
    why: "Clients and their customers judge the app by its URL; a `*.vercel.app` address or a certificate warning looks unfinished.",
    fix: "Point the domain at the host, confirm the certificate is issued, redirect `www` to the apex (or the reverse), and check the old preview URL isn't the one being shared.",
  });

  const names = [...envReferences(ctx).keys()];
  manual(
    "hosting-env",
    `Environment variables set in the hosting provider${names.length ? ` (${names.length} used in code)` : ""}`,
    {
      why: "Values in your local `.env` don't travel with the code; one missing variable in production is the most common launch-day outage.",
      fix: `Set every variable for the Production environment (not only Preview)${names.length ? `: ${names.map((n) => `\`${n}\``).join(", ")}` : ""}. Use production values (live keys, production URLs), then redeploy.`,
    },
  );

  const { sql, document } = detectDatabases(ctx);
  if (sql.length + document.length > 0) {
    manual("production-database", "Production points at a production database", {
      why: "Apps built in a hurry often launch on the development database: test data in front of customers, and every experiment risks real data.",
      fix: "Use a separate project/database for production, apply migrations to it, and check the production `DATABASE_URL` (or Supabase URL) is not the dev one.",
    });
  }

  const supabaseAuth = ctx.sourceFiles.some((f) => /\.auth\.\w+\s*\(/.test(f.content));
  const auth = AUTH_LIBS.filter(
    ([re, name]) => uses(re) && (name !== "Supabase Auth" || supabaseAuth),
  ).map(([, n]) => n);
  if (auth.length > 0) {
    manual(
      "auth-urls",
      `Auth callback and site URLs use the production domain (${[...new Set(auth)].join(", ")})`,
      {
        why: "OAuth and magic links still configured for `localhost` or the preview URL break sign-in on launch day.",
        fix: "Update the site URL and allowed redirect URLs (Supabase → Authentication → URL configuration; Google/GitHub OAuth app callback URLs; `BETTER_AUTH_URL`/`NEXTAUTH_URL`) and sign in once on the production domain.",
      },
    );
  }

  if (uses(/^stripe$|^@stripe\//)) {
    manual("stripe-live", "Stripe live mode: live keys, live webhook endpoint, account activated", {
      why: "Test keys accept fake cards only; a webhook endpoint created in test mode never receives live events, so payments succeed but orders are never fulfilled.",
      fix: "Activate the account, set live `sk_live_`/`pk_live_` keys in production, create the webhook endpoint in live mode for the production URL with its own signing secret, and make one real purchase and refund.",
    });
  }

  manual("uptime-monitoring", "Uptime monitoring and alerts", {
    why: "Without a check that runs every few minutes, the first person to notice an outage is a customer or the client.",
    fix: "Add a free uptime monitor (Better Stack, UptimeRobot, Checkly) on the home page and one critical route, alerting the person who will fix it.",
  });

  manual("rollback-plan", "Rollback plan", {
    why: "If the launch deploy breaks something, you need to know in advance how to go back in minutes, including what happens to database changes.",
    fix: "Know how to promote the previous deployment (Vercel: Instant Rollback; Docker: previous image tag), keep migrations backward compatible, and write the steps down for the client.",
  });
  return items;
}
