import { lineAt } from "../files.mjs";
import { isSuppressed, snippet } from "../findings.mjs";

const MIDDLEWARE = /^(?:src\/)?(?:middleware|proxy)\.[mc]?[jt]s$/;

/** Things a middleware does when it requires a signed-in user. */
const REQUIRES_AUTH =
  /\bclerkMiddleware\s*\(\s*(?:async\s*)?\(|\bauthMiddleware\s*\(|\bwithAuth\s*\(|\bauth\.protect\s*\(|\bgetToken\s*\(|\bgetSession\w*\s*\(|\bupdateSession\s*\(|\bsupabase\.auth\.|NextResponse\.redirect\s*\(|Response\.redirect\s*\(|\bstatus\s*:\s*401\b/;

/** Converts a Next.js `matcher` entry (path-to-regexp style) into a RegExp. */
function matcherToRegExp(matcher) {
  const source = matcher
    .replace(/\/:\w+\*/g, "(?:/.*)?")
    .replace(/\/:\w+\+/g, "/.+")
    .replace(/\/:\w+\?/g, "(?:/[^/]+)?")
    .replace(/:\w+/g, "[^/]+");
  try {
    return new RegExp(`^${source}$`);
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   files: import("../files.mjs").SourceFile[];
 *   webhooks: import("../routes.mjs").StripeWebhook[];
 * }} ctx
 */
export function checkMiddleware(ctx) {
  const findings = [];
  const middleware = ctx.files.find((f) => MIDDLEWARE.test(f.path));
  if (!middleware || ctx.webhooks.length === 0) return findings;
  const auth = REQUIRES_AUTH.exec(middleware.content);
  if (!auth) return findings;

  const configBlock = /\bmatcher\s*:\s*(\[[\s\S]*?\]|["'`][^"'`]+["'`])/.exec(middleware.content);
  const matchers = configBlock
    ? [...configBlock[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => matcherToRegExp(m[1]))
    : [/.*/]; // no matcher: middleware runs on every request

  const code = middleware.content.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, "$1");
  for (const { url } of ctx.webhooks) {
    // Any explicit mention of the webhook path is taken as an exclusion (public route list).
    if (/webhook/i.test(code) || code.includes(url)) continue;
    if (!matchers.some((re) => re?.test(url))) continue;
    const index = configBlock?.index ?? auth.index;
    const line = lineAt(middleware.content, index);
    if (isSuppressed(middleware, line, "webhook-behind-auth")) continue;
    findings.push({
      check: "webhook-behind-auth",
      category: "webhooks",
      severity: "medium",
      title: `Middleware requiring sign-in also runs on the Stripe webhook \`${url}\``,
      file: middleware.path,
      line,
      snippet: snippet(middleware, line),
      why: "Stripe calls the webhook without a session cookie. If the middleware redirects or returns 401, every event fails, payments are never recorded and Stripe eventually disables the endpoint.",
      fix: `Exclude the webhook from the matcher (e.g. \`"/((?!api/webhooks|_next/static|_next/image|favicon.ico).*)"\`) or add \`${url}\` to the public routes. The webhook authenticates with its signature instead.`,
    });
  }
  return findings;
}
