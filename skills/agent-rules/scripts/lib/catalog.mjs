/**
 * Libraries worth mentioning in agent rules, grouped by what they decide.
 * `match` is an exact package name or a prefix ending in `/` (a scope).
 */
export const CATEGORIES = {
  orm: "ORM / query builder",
  database: "Database client",
  auth: "Authentication",
  payments: "Payments",
  validation: "Validation",
  styling: "Styling",
  ui: "UI components",
  forms: "Forms",
  state: "State / data fetching",
  email: "Email",
  testing: "Testing",
  lint: "Lint / format",
  env: "Env validation",
  rateLimit: "Rate limiting",
  monitoring: "Monitoring",
  ai: "AI SDKs",
  i18n: "i18n",
};

/** @type {{ category: keyof typeof CATEGORIES; label: string; match: string[] }[]} */
export const LIBRARIES = [
  { category: "orm", label: "Drizzle ORM", match: ["drizzle-orm"] },
  { category: "orm", label: "drizzle-kit (migrations)", match: ["drizzle-kit"] },
  { category: "orm", label: "Prisma", match: ["@prisma/client", "prisma"] },
  { category: "orm", label: "Kysely", match: ["kysely"] },
  { category: "orm", label: "TypeORM", match: ["typeorm"] },
  { category: "orm", label: "Mongoose", match: ["mongoose"] },
  { category: "database", label: "postgres.js", match: ["postgres"] },
  { category: "database", label: "node-postgres (pg)", match: ["pg"] },
  { category: "database", label: "Supabase", match: ["@supabase/supabase-js"] },
  { category: "database", label: "Neon serverless", match: ["@neondatabase/serverless"] },
  { category: "database", label: "Vercel Postgres", match: ["@vercel/postgres"] },
  { category: "database", label: "PlanetScale", match: ["@planetscale/database"] },
  { category: "database", label: "libSQL / Turso", match: ["@libsql/client"] },
  { category: "database", label: "MySQL (mysql2)", match: ["mysql2"] },
  { category: "database", label: "SQLite (better-sqlite3)", match: ["better-sqlite3"] },
  { category: "database", label: "MongoDB driver", match: ["mongodb"] },
  { category: "database", label: "Upstash Redis", match: ["@upstash/redis"] },
  { category: "auth", label: "Better Auth", match: ["better-auth"] },
  { category: "auth", label: "Auth.js / NextAuth", match: ["next-auth", "@auth/"] },
  { category: "auth", label: "Clerk", match: ["@clerk/"] },
  {
    category: "auth",
    label: "Supabase Auth",
    match: ["@supabase/ssr", "@supabase/auth-helpers-nextjs"],
  },
  { category: "auth", label: "Lucia", match: ["lucia", "@lucia-auth/"] },
  { category: "auth", label: "Kinde", match: ["@kinde-oss/"] },
  { category: "auth", label: "WorkOS", match: ["@workos-inc/"] },
  { category: "auth", label: "iron-session", match: ["iron-session"] },
  { category: "payments", label: "Stripe", match: ["stripe", "@stripe/"] },
  { category: "payments", label: "Lemon Squeezy", match: ["@lemonsqueezy/"] },
  { category: "payments", label: "Polar", match: ["@polar-sh/"] },
  { category: "payments", label: "Paddle", match: ["@paddle/"] },
  { category: "validation", label: "Zod", match: ["zod"] },
  { category: "validation", label: "Valibot", match: ["valibot"] },
  { category: "validation", label: "Yup", match: ["yup"] },
  { category: "validation", label: "ArkType", match: ["arktype"] },
  { category: "validation", label: "next-safe-action", match: ["next-safe-action"] },
  { category: "styling", label: "Tailwind CSS", match: ["tailwindcss", "@tailwindcss/"] },
  { category: "styling", label: "styled-components", match: ["styled-components"] },
  { category: "styling", label: "Emotion", match: ["@emotion/"] },
  { category: "styling", label: "Sass", match: ["sass"] },
  { category: "ui", label: "Radix UI", match: ["@radix-ui/", "radix-ui"] },
  { category: "ui", label: "Base UI", match: ["@base-ui-components/", "@base-ui/"] },
  { category: "ui", label: "Lucide icons", match: ["lucide-react"] },
  { category: "ui", label: "Mantine", match: ["@mantine/"] },
  { category: "ui", label: "Chakra UI", match: ["@chakra-ui/"] },
  { category: "ui", label: "MUI", match: ["@mui/"] },
  { category: "forms", label: "React Hook Form", match: ["react-hook-form"] },
  { category: "forms", label: "TanStack Form", match: ["@tanstack/react-form"] },
  { category: "forms", label: "Conform", match: ["@conform-to/"] },
  { category: "state", label: "TanStack Query", match: ["@tanstack/react-query"] },
  { category: "state", label: "SWR", match: ["swr"] },
  { category: "state", label: "Zustand", match: ["zustand"] },
  { category: "state", label: "Jotai", match: ["jotai"] },
  { category: "state", label: "Redux Toolkit", match: ["@reduxjs/toolkit"] },
  { category: "state", label: "tRPC", match: ["@trpc/"] },
  { category: "state", label: "nuqs (URL state)", match: ["nuqs"] },
  { category: "email", label: "Resend", match: ["resend"] },
  { category: "email", label: "React Email", match: ["@react-email/", "react-email"] },
  { category: "email", label: "Nodemailer", match: ["nodemailer"] },
  { category: "email", label: "Postmark", match: ["postmark"] },
  { category: "email", label: "SendGrid", match: ["@sendgrid/mail"] },
  { category: "testing", label: "Vitest", match: ["vitest"] },
  { category: "testing", label: "Jest", match: ["jest"] },
  { category: "testing", label: "Playwright", match: ["@playwright/test", "playwright"] },
  { category: "testing", label: "Cypress", match: ["cypress"] },
  { category: "testing", label: "Testing Library", match: ["@testing-library/"] },
  { category: "testing", label: "MSW", match: ["msw"] },
  { category: "lint", label: "ESLint", match: ["eslint"] },
  { category: "lint", label: "Biome", match: ["@biomejs/biome"] },
  { category: "lint", label: "Prettier", match: ["prettier"] },
  { category: "lint", label: "oxlint", match: ["oxlint"] },
  { category: "lint", label: "Husky (git hooks)", match: ["husky"] },
  { category: "lint", label: "lint-staged", match: ["lint-staged"] },
  { category: "lint", label: "Lefthook", match: ["lefthook"] },
  { category: "env", label: "T3 Env", match: ["@t3-oss/env-nextjs", "@t3-oss/env-core"] },
  { category: "rateLimit", label: "Upstash Ratelimit", match: ["@upstash/ratelimit"] },
  { category: "rateLimit", label: "Arcjet", match: ["@arcjet/"] },
  { category: "monitoring", label: "Sentry", match: ["@sentry/"] },
  { category: "monitoring", label: "PostHog", match: ["posthog-js", "posthog-node"] },
  { category: "monitoring", label: "Vercel Analytics", match: ["@vercel/analytics"] },
  { category: "ai", label: "Vercel AI SDK", match: ["ai", "@ai-sdk/"] },
  { category: "ai", label: "OpenAI SDK", match: ["openai"] },
  { category: "ai", label: "Anthropic SDK", match: ["@anthropic-ai/sdk"] },
  { category: "i18n", label: "next-intl", match: ["next-intl"] },
  { category: "i18n", label: "i18next", match: ["i18next", "react-i18next"] },
];

const matches = (pkg, pattern) =>
  pattern.endsWith("/") ? pkg.startsWith(pattern) : pkg === pattern;

/**
 * Libraries found in a merged dependency map.
 * @param {Record<string, string>} deps
 * @param {Set<string>} devOnly package names that appear only in devDependencies
 */
export function detectLibraries(deps, devOnly = new Set()) {
  /** @type {Record<string, { label: string; packages: { name: string; version: string; dev: boolean }[] }[]>} */
  const found = {};
  const names = Object.keys(deps).sort();
  for (const lib of LIBRARIES) {
    const packages = names
      .filter((name) => lib.match.some((m) => matches(name, m)))
      .map((name) => ({ name, version: deps[name] ?? "", dev: devOnly.has(name) }));
    if (packages.length === 0) continue;
    found[lib.category] ??= [];
    found[lib.category]?.push({ label: lib.label, packages });
  }
  return found;
}
