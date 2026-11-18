import { stripComments } from "../files.mjs";
import { collector } from "../items.mjs";

const HEADERS = [
  ["Content-Security-Policy", /content-security-policy/i],
  ["X-Frame-Options", /x-frame-options|frame-ancestors/i],
  ["X-Content-Type-Options", /x-content-type-options/i],
  ["Strict-Transport-Security", /strict-transport-security/i],
  ["Referrer-Policy", /referrer-policy/i],
];

/** @param {import("../project.mjs").Context} ctx */
export function checkSecurity(ctx) {
  const { items, pass, warn, manual } = collector("security");

  if (ctx.isNext) {
    // 1. Security headers, anywhere they can be set.
    const sources = ctx.files.filter((f) =>
      /^(next\.config\.[mc]?[jt]s|(src\/)?(middleware|proxy)\.[mc]?[jt]s|vercel\.json|netlify\.toml)$/.test(
        f.path,
      ),
    );
    const text = sources.map((f) => stripComments(f.content)).join("\n");
    const found = HEADERS.filter(([, re]) => re.test(text)).map(([name]) => name);
    if (found.length > 0) {
      pass(
        "security-headers",
        `Security headers configured (${found.length}/${HEADERS.length}: ${found.join(", ")})`,
      );
    } else {
      warn("security-headers", "No security headers configured", {
        ...(ctx.nextConfig ? { file: ctx.nextConfig.path } : {}),
        why: "Without them the site can be framed for clickjacking and has no second line of defense against XSS.",
        fix: "Return them for `/:path*` from `headers()` in next.config (or set them in middleware). The security-audit skill lists exactly which ones are missing.",
      });
    }

    // 2. X-Powered-By.
    if (/poweredByHeader\s*:\s*false/.test(ctx.nextConfigCode)) {
      pass("powered-by-header", "`X-Powered-By` header disabled");
    } else {
      warn("powered-by-header", "`X-Powered-By: Next.js` header is sent", {
        ...(ctx.nextConfig ? { file: ctx.nextConfig.path } : {}),
        why: "Advertises the framework to automated scanners looking for known vulnerable versions. Minor, but free to fix.",
        fix: "Add `poweredByHeader: false` to next.config.",
      });
    }
  }

  // 3. Deep security review is a separate skill.
  manual("security-audit", "Run the security-audit skill", {
    why: "This checklist only covers the basics. Leaked keys, routes without auth, queries that leak other customers' data, unverified webhooks and Supabase tables without RLS are what actually get apps breached.",
    fix: 'Ask your agent to "run a security audit" (`npx skills add kitwright-ai/skills --skill security-audit`) and fix every confirmed high finding before launch.',
  });
  return items;
}
