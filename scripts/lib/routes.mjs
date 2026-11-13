import { isRouteFile, routePath } from "./files.mjs";

export const AUTH_MARKERS =
  /\b(?:withAuth\w*|requireAuth\w*|requireUser|requireSession|requirePermission|requireRole|requireAdmin|getServerSession|getSession|currentUser|getAuth|getUser|getCurrentUser|validateRequest|verifySession|getKindeServerSession|withApiAuthRequired|getToken|authorize|authActionClient|protectedProcedure|authedProcedure)\s*[(.<]|\bauth\s*\(\s*\)|\bauth\.api\.getSession\b|\bsupabase\.auth\.getUser\b|\bclerkClient\b/;

/** Route files that are the auth provider's own endpoints. */
const AUTH_HANDLER =
  /toNextJsHandler\s*\(|NextAuth\s*\(|export\s*(?:const\s*)?\{\s*GET\s*,\s*POST\s*\}\s*(?:=|from)|handleAuth\s*\(|\bhandlers\s*\}\s*=|createRouteHandler\s*\(/;

/** Paths that are public by nature (sign-in flows, health checks, metadata). */
const AUTH_FLOW_PATH =
  /\/(auth|login|log-in|signin|sign-in|signup|sign-up|register|logout|password|reset|forgot|otp|magic|verify|callback|oauth|invite|accept-invitation)(\/|$)/i;
const META_PATH =
  /\/(health|healthz|status|ping|og|opengraph-image|sitemap|robots|manifest|favicon|icon)(\/|$|\.)/i;

const WEBHOOK_PATH = /\/(webhooks?|hooks?)(\/|$)/i;
const WEBHOOK_CONTENT =
  /stripe-signature|svix-|x-hub-signature|x-signature|webhook-signature|checkout\.session\.completed|customer\.subscription\./;

export const PUBLIC_ANNOTATION = /security-audit:\s*public\b/;

const METHOD_EXPORT =
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=|export\s*(?:const\s*)?\{([^}]*)\}/g;

/**
 * @typedef {{
 *   file: import("./files.mjs").SourceFile; url: string; methods: string[];
 *   kind: "auth-handler" | "webhook" | "auth-flow" | "meta" | "public" | "app";
 * }} Route
 */

/** @returns {Route[]} */
export function classifyRoutes(files) {
  const routes = [];
  for (const file of files) {
    if (!isRouteFile(file.path)) continue;
    const url = routePath(file.path);
    const methods = new Set();
    for (const m of file.content.matchAll(METHOD_EXPORT)) {
      if (m[1] || m[2]) methods.add(m[1] ?? m[2]);
      for (const name of (m[3] ?? "").split(/[\s,]+/)) {
        if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(name)) methods.add(name);
      }
    }
    if (file.path.includes("pages/api/") && /export\s+default/.test(file.content))
      methods.add("ANY");
    if (methods.size === 0) continue;

    let kind = "app";
    if (AUTH_HANDLER.test(file.content)) kind = "auth-handler";
    else if (WEBHOOK_PATH.test(url) || WEBHOOK_CONTENT.test(file.content)) kind = "webhook";
    else if (PUBLIC_ANNOTATION.test(file.content)) kind = "public";
    else if (AUTH_FLOW_PATH.test(url)) kind = "auth-flow";
    else if (META_PATH.test(url) && [...methods].every((m) => m === "GET")) kind = "meta";
    routes.push({ file, url, methods: [...methods], kind });
  }
  return routes;
}

/** Index of the first exported handler, for reporting. */
export function firstHandlerIndex(file) {
  METHOD_EXPORT.lastIndex = 0;
  const m = METHOD_EXPORT.exec(file.content);
  METHOD_EXPORT.lastIndex = 0;
  return m?.index ?? 0;
}
