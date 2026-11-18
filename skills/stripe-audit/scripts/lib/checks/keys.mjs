import {
  blockFrom,
  ENV_TEMPLATE,
  isClientFile,
  isEnvFile,
  isSourceFile,
  isTestFile,
  lineAt,
} from "../files.mjs";
import { isSuppressed, snippet } from "../findings.mjs";

const SECRET_KEY = /\b[rs]k_(live|test)_[0-9A-Za-z]{8,}/g;
const WEBHOOK_SECRET = /\bwhsec_[0-9A-Za-z]{8,}/g;
const DEV_ENV = /(^|\/)\.env(\.local|\.development(\.local)?|\.test(\.local)?)$/;
const PUBLIC_STRIPE_SECRET_NAME =
  "(?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_|REACT_APP_)\\w*STRIPE\\w*(?:SECRET|RESTRICTED|WEBHOOK|PRIVATE|_SK)\\w*";
/** The variable being read or defined — not just mentioned in prose. */
const PUBLIC_STRIPE_SECRET_IN_CODE = new RegExp(
  `(?:process\\.env|import\\.meta\\.env|\\benv)\\.(${PUBLIC_STRIPE_SECRET_NAME})|^\\s*(${PUBLIC_STRIPE_SECRET_NAME})\\s*:`,
  "gm",
);
const PUBLIC_STRIPE_SECRET_IN_ENV = new RegExp(
  `^\\s*(?:export\\s+)?(${PUBLIC_STRIPE_SECRET_NAME})\\s*=`,
  "gm",
);
const PUBLIC_WITH_SECRET_VALUE =
  /^\s*(?:export\s+)?((?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_|REACT_APP_)\w+)\s*=\s*["']?(?:[rs]k_(?:live|test)_|whsec_)/gm;

/** @param {{ files: import("../files.mjs").SourceFile[] }} ctx */
export function checkKeys(ctx) {
  const findings = [];
  const add = (file, index, finding) => {
    const line = lineAt(file.content, index);
    if (isSuppressed(file, line, finding.check)) return;
    findings.push({
      category: "keys",
      file: file.path,
      line,
      snippet: snippet(file, line),
      ...finding,
    });
  };

  for (const file of ctx.files) {
    if (isTestFile(file.path)) continue;
    const env = isEnvFile(file.path);
    const template = env && ENV_TEMPLATE.test(file.path);
    const source = isSourceFile(file.path);

    // Live keys in files meant for local development.
    if (env && DEV_ENV.test(file.path)) {
      for (const m of file.content.matchAll(SECRET_KEY)) {
        if (m[1] !== "live") continue;
        add(file, m.index, {
          check: "live-key-in-dev-files",
          severity: "high",
          title: `Live Stripe key in \`${file.path}\``,
          why: "Local development, tests and `stripe trigger` runs then create real charges, refunds and customers, and the key is copied to every laptop and tool that reads this file.",
          fix: "Use test-mode keys (and a `stripe listen` webhook secret) locally. Keep live keys only in the production environment of your host, and roll this key in the Dashboard if the file was ever shared.",
        });
      }
    }

    // Secret / restricted keys and webhook secrets written in code.
    if (source) {
      for (const m of file.content.matchAll(SECRET_KEY)) {
        add(file, m.index, {
          check: "secret-key-exposed",
          severity: m[1] === "live" ? "high" : "medium",
          title: `Stripe ${m[0].startsWith("r") ? "restricted" : "secret"} key (${m[1]} mode) hard-coded in source`,
          why: "The secret key can create charges, issue refunds and read every customer. In code it ends up in git history, logs and possibly the client bundle.",
          fix: "Read it from `process.env.STRIPE_SECRET_KEY` in a server-only module validated at startup, and roll the key in the Dashboard (Developers → API keys): it must be considered leaked.",
        });
      }
      for (const m of file.content.matchAll(WEBHOOK_SECRET)) {
        add(file, m.index, {
          check: "webhook-secret-hardcoded",
          severity: "high",
          title: "Stripe webhook signing secret hard-coded in source",
          why: 'With the signing secret anyone can forge correctly signed events ("payment succeeded") and your webhook will trust them.',
          fix: "Read it from `process.env.STRIPE_WEBHOOK_SECRET` and roll the secret on the webhook endpoint in the Dashboard.",
        });
      }
    }

    // Secret keys exposed to the browser through a public prefix.
    if (!template && (env || source)) {
      const seen = new Set();
      const declared = env ? PUBLIC_STRIPE_SECRET_IN_ENV : PUBLIC_STRIPE_SECRET_IN_CODE;
      for (const m of file.content.matchAll(declared)) {
        const name = m[1] ?? m[2] ?? "";
        if (seen.has(name)) continue;
        seen.add(name);
        add(file, m.index + m[0].indexOf(name), publicFinding(name));
      }
      if (env) {
        for (const m of file.content.matchAll(PUBLIC_WITH_SECRET_VALUE)) {
          if (seen.has(m[1])) continue;
          seen.add(m[1]);
          add(file, m.index + m[0].indexOf(m[1]), publicFinding(m[1]));
        }
      }
    }

    // Secret key read in a client component.
    if (source && isClientFile(file)) {
      const read =
        /process\.env\.(\w*STRIPE\w*(?:SECRET|RESTRICTED|WEBHOOK)\w*)/.exec(file.content) ??
        /\bimport\s+\w+\s+from\s+["']stripe["']/.exec(file.content);
      if (read && !read[0].includes("NEXT_PUBLIC_")) {
        add(file, read.index, {
          check: "secret-key-exposed",
          severity: "high",
          title: "Client component uses the Stripe secret key or server SDK",
          why: 'Files with "use client" run in the browser. The secret key is either undefined there (broken checkout) or inlined into the bundle for every visitor to copy.',
          fix: "Create Checkout sessions in a route handler or server action and send only the session URL to the browser. Client code should use `@stripe/stripe-js` with the publishable key.",
        });
      }
    }

    // next.config `env` inlines values into client code.
    if (/(^|\/)next\.config\.[mc]?[jt]s$/.test(file.path)) {
      const block = /\benv\s*:\s*\{([^}]*)\}/.exec(file.content);
      const name = block && /\b(\w*STRIPE\w*(?:SECRET|RESTRICTED|WEBHOOK)\w*)\s*:/.exec(block[1]);
      if (block && name) {
        add(file, block.index + block[0].indexOf(name[1]), {
          ...publicFinding(name[1]),
          title: `\`${name[1]}\` is inlined into the client bundle by next.config \`env\``,
        });
      }
    }

    // API version not pinned.
    if (source) {
      for (const m of file.content.matchAll(/\bnew\s+Stripe\s*\(/g)) {
        const call = blockFrom(file.content, m.index + m[0].length - 1);
        if (/\bapiVersion\b/.test(call)) continue;
        add(file, m.index, {
          check: "api-version-unpinned",
          severity: "low",
          title: "Stripe client created without `apiVersion`",
          why: "Without an explicit version, upgrading the `stripe` package (or, on old SDKs, changing the account default) silently changes the shape of API responses and webhook payloads your code relies on.",
          fix: 'Pass the version you tested with: `new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "<version>" })`, and upgrade it deliberately (the webhook endpoint has its own version in the Dashboard).',
        });
      }
    }
  }
  return findings;
}

function publicFinding(name) {
  return {
    check: "secret-key-exposed",
    severity: "high",
    title: `Stripe secret exposed to the browser as \`${name}\``,
    why: "Variables with a public prefix are inlined into the client bundle and visible to every visitor. With the secret key anyone can charge, refund and read your customers.",
    fix: "Rename it without the public prefix (e.g. `STRIPE_SECRET_KEY`), read it only on the server, and roll the key in the Dashboard. Only the publishable key (`pk_…`) belongs in the browser.",
  };
}
