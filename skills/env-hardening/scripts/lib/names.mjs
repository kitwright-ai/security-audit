export const CLIENT_PREFIX = "NEXT_PUBLIC_";

/** Names that look like credentials. */
export const SECRET_NAME =
  /SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|PASSWD|TOKEN|API_KEY|_KEY$|^KEY$|CREDENTIAL|DATABASE_URL|DB_URL|CONNECTION_STRING/;

/** Client-side keys that are meant to be public even though their names end in `_KEY`. */
export const PUBLIC_BY_DESIGN =
  /PUBLISHABLE|ANON_KEY|PUBLIC_KEY|SITE_KEY|POSTHOG|SEGMENT|MAPBOX|ALGOLIA_SEARCH|FIREBASE|MEASUREMENT|GTM|GA_|PLAUSIBLE|SENTRY_DSN|CLIENT_KEY/;

/** Set by Node, Next.js or the hosting platform: never belong in .env.example. */
export const BUILTIN =
  /^(NODE_ENV|NEXT_RUNTIME|NEXT_PHASE|NEXT_DEPLOYMENT_ID|VERCEL|VERCEL_[A-Z0-9_]+|CI|TZ|PWD|HOME|HOSTNAME|npm_[A-Za-z0-9_]+)$/;

/** Read by tooling (the env.ts template's escape hatch), not by the app. */
export const TOOLING = /^(SKIP_ENV_VALIDATION|ANALYZE|NEXT_TELEMETRY_DISABLED)$/;

/**
 * Read implicitly by popular libraries: listed in .env.example but never in code is expected.
 */
export const LIBRARY_READ =
  /^(AUTH_SECRET|AUTH_URL|AUTH_TRUST_HOST|NEXTAUTH_SECRET|NEXTAUTH_URL|BETTER_AUTH_SECRET|BETTER_AUTH_URL|SENTRY_AUTH_TOKEN|SENTRY_ORG|SENTRY_PROJECT|AUTH_[A-Z]+_(ID|SECRET))$/;

export const isClientName = (name) => name.startsWith(CLIENT_PREFIX);

export const looksSecret = (name) => {
  const bare = isClientName(name) ? name.slice(CLIENT_PREFIX.length) : name;
  return SECRET_NAME.test(bare) && !PUBLIC_BY_DESIGN.test(bare);
};

/** "client" (NEXT_PUBLIC_), "shared" (NODE_ENV) or "server". */
export function sideOf(name) {
  if (name === "NODE_ENV") return "shared";
  return isClientName(name) ? "client" : "server";
}

/** Why a NEXT_PUBLIC_ key-like name is not flagged, or undefined. */
export function publicByDesignNote(name) {
  if (!isClientName(name)) return undefined;
  const bare = name.slice(CLIENT_PREFIX.length);
  if (!SECRET_NAME.test(bare) || !PUBLIC_BY_DESIGN.test(bare)) return undefined;
  if (/ANON_KEY/.test(bare)) {
    return "Supabase's anon key is public by design: it is meant for the browser and only grants what your row level security policies allow. Keep RLS enabled on every table and never expose the service_role key.";
  }
  if (/PUBLISHABLE/.test(bare)) {
    return "Publishable keys (Stripe `pk_...`) are meant for the browser. Make sure the value really is the publishable key, not the secret one.";
  }
  return "Treated as a client-side SDK key that is public by design. Confirm the value is the public/client key, not a secret one.";
}
