import { blockFrom, isServerActionFile, isTestFile, lineAt } from "../files.mjs";
import { isSuppressed, snippet } from "../findings.mjs";
import { classifyRoutes, firstHandlerIndex } from "../routes.mjs";
import { PUBLIC_ACTION } from "./auth.mjs";
import { SIGNATURE_MARKERS } from "./webhooks.mjs";

const RATE_LIMIT_MARKERS =
  /@upstash\/ratelimit|rate-limiter-flexible|express-rate-limit|@arcjet|\brate_?limit\w*\s*[(.:]|\bratelimit\w*\s*[(.:]|\blimiter\s*\.|slidingWindow|tokenBucket|checkRateLimit|RateLimit\w*\s*\(/i;

const REQUIRED_HEADERS = [
  { name: "Content-Security-Policy", re: /content-security-policy/i, severity: "low" },
  {
    name: "X-Frame-Options or CSP frame-ancestors",
    re: /x-frame-options|frame-ancestors/i,
    severity: "medium",
  },
  { name: "X-Content-Type-Options", re: /x-content-type-options/i, severity: "low" },
  { name: "Strict-Transport-Security", re: /strict-transport-security/i, severity: "low" },
  { name: "Referrer-Policy", re: /referrer-policy/i, severity: "low" },
];

const order = { high: 0, medium: 1, low: 2 };

/** @param {{ files: import("../files.mjs").SourceFile[]; isNext: boolean }} ctx */
export function checkHardening(ctx) {
  const findings = [];
  const add = (file, index, finding) => {
    const line = file ? lineAt(file.content, index) : undefined;
    if (file && isSuppressed(file, line, finding.check)) return;
    findings.push({
      category: "hardening",
      ...(file ? { file: file.path, line, snippet: snippet(file, line) } : {}),
      ...finding,
    });
  };

  const middleware = ctx.files.filter((f) =>
    /(^|\/)(src\/)?(middleware|proxy)\.[mc]?[jt]s$/.test(f.path),
  );
  const globalLimit = middleware.some((f) => RATE_LIMIT_MARKERS.test(f.content));

  // Better Auth rate limits its own endpoints unless disabled.
  const betterAuthLimited = ctx.files.some(
    (f) =>
      /betterAuth\s*\(/.test(f.content) &&
      !/rateLimit\s*:\s*\{[^}]*enabled\s*:\s*false/.test(f.content),
  );

  // 1. Public endpoints without rate limiting.
  if (!globalLimit) {
    for (const route of classifyRoutes(ctx.files)) {
      if (isTestFile(route.file.path)) continue;
      const isPublic = ["public", "auth-flow"].includes(route.kind);
      const isUnverifiedWebhook =
        route.kind === "webhook" && !SIGNATURE_MARKERS.test(route.file.content);
      const isAuthHandler = route.kind === "auth-handler" && !betterAuthLimited;
      if (!isPublic && !isUnverifiedWebhook && !isAuthHandler) continue;
      if (RATE_LIMIT_MARKERS.test(route.file.content)) continue;
      add(route.file, firstHandlerIndex(route.file), {
        check: "public-route-without-rate-limit",
        severity: "medium",
        title: `Public endpoint \`${route.url}\` has no rate limiting`,
        why: "Unauthenticated endpoints (sign-in, sign-up, password reset, forms, bookings) are the first target of credential stuffing, spam and enumeration.",
        fix: "Limit requests per IP and per account (e.g. a sliding window in middleware/proxy or at the start of the handler) and return 429 with Retry-After.",
      });
    }

    for (const file of ctx.files) {
      if (!isServerActionFile(file) || isTestFile(file.path)) continue;
      for (const m of file.content.matchAll(
        /export\s+(?:async\s+function\s+(\w+)|const\s+(\w+)\s*=)/g,
      )) {
        const name = m[1] ?? m[2];
        if (!PUBLIC_ACTION.test(name)) continue;
        const open = file.content.indexOf("{", m.index);
        const body = open === -1 ? "" : blockFrom(file.content, open);
        if (
          RATE_LIMIT_MARKERS.test(body) ||
          RATE_LIMIT_MARKERS.test(file.content.slice(0, m.index))
        )
          continue;
        add(file, m.index, {
          check: "public-route-without-rate-limit",
          severity: "medium",
          title: `Public server action \`${name}\` has no rate limiting`,
          why: "Server actions are HTTP endpoints; public ones can be called in a loop.",
          fix: "Rate limit by IP (from `headers()`) and by target account before doing any work.",
        });
      }
    }
  }

  // 2. Security headers (Next.js projects).
  if (ctx.isNext) {
    const sources = ctx.files.filter(
      (f) =>
        /(^|\/)next\.config\.[mc]?[jt]s$/.test(f.path) ||
        /(^|\/)(src\/)?(middleware|proxy)\.[mc]?[jt]s$/.test(f.path) ||
        /(^|\/)vercel\.json$/.test(f.path) ||
        /(^|\/)(netlify\.toml|_headers)$/.test(f.path),
    );
    const text = sources.map((f) => f.content).join("\n");
    const missing = REQUIRED_HEADERS.filter((h) => !h.re.test(text));
    if (missing.length > 0) {
      const config = sources.find((f) => /next\.config/.test(f.path));
      const severity =
        missing.length === REQUIRED_HEADERS.length
          ? "medium"
          : missing.sort((a, b) => order[a.severity] - order[b.severity])[0].severity;
      if (!(config && isSuppressed(config, 1, "missing-security-headers"))) {
        findings.push({
          check: "missing-security-headers",
          category: "hardening",
          severity,
          title: `Missing security headers: ${missing.map((h) => h.name).join(", ")}`,
          ...(config ? { file: config.path, line: 1 } : {}),
          why: "Security headers block clickjacking, MIME sniffing, downgrade attacks and limit the damage of XSS.",
          fix: "Add them for all routes in `next.config` `headers()` (or in middleware/proxy): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, and a `Content-Security-Policy`.",
        });
      }
    }
  }
  return findings;
}
