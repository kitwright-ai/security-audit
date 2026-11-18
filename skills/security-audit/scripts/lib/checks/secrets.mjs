import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { isClientFile, isTestFile } from "../files.mjs";
import { isSuppressed, snippet } from "../findings.mjs";

const SECRET_PATTERNS = [
  { name: "Stripe live secret key", re: /\b[rs]k_live_[0-9A-Za-z]{16,}\b/g, severity: "high" },
  { name: "Stripe test secret key", re: /\b[rs]k_test_[0-9A-Za-z]{16,}\b/g, severity: "medium" },
  { name: "Stripe webhook secret", re: /\bwhsec_[0-9A-Za-z]{16,}\b/g, severity: "high" },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g, severity: "high" },
  {
    name: "GitHub token",
    re: /\b(?:gh[pousr]_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{40,})\b/g,
    severity: "high",
  },
  { name: "Slack token", re: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/g, severity: "high" },
  {
    name: "OpenAI / Anthropic API key",
    re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b/g,
    severity: "high",
  },
  { name: "Resend API key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/g, severity: "high" },
  {
    name: "Private key",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
    severity: "high",
  },
];

const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}\b/g;
const DB_URL =
  /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\/([^\s:@/'"`]+):([^\s@/'"`]+)@([^\s/:'"`]+)/g;
const LOCAL_HOSTS =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|mysql|redis|database|host\.docker\.internal)$/i;
const PLACEHOLDER =
  /\$\{|<|your|example|changeme|replace|placeholder|xxx|\*\*\*|password$|^pass$|^secret$|^postgres$/i;

const PUBLIC_PREFIX = /\b(NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_|PUBLIC_|REACT_APP_)[A-Z0-9_]+\b/g;
const SECRET_NAME = /SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|PASSWD|TOKEN|API_KEY|_KEY$/;
const PUBLIC_BY_DESIGN =
  /PUBLISHABLE|ANON_KEY|PUBLIC_KEY|SITE_KEY|POSTHOG|SEGMENT|MAPBOX|ALGOLIA_SEARCH|FIREBASE|MEASUREMENT|GTM|GA_|PLAUSIBLE|SENTRY_DSN|CLIENT_KEY/;

const ENV_FILE = /(^|\/)\.env(\.[^/]+)?$/;
const ENV_TEMPLATE = /\.(example|sample|template|dist|defaults)$/;

function isTracked(root, path) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", path], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function insideGitRepo(root) {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Converts a .gitignore glob to a RegExp: "**" + "/" (any dirs), "*", "?"; everything else literal.
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*" && glob[i + 2] === "/") {
      out += "(?:.*/)?";
      i += 2;
    } else if (ch === "*" && glob[i + 1] === "*") {
      out += ".*";
      i += 1;
    } else if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** Rules of one .gitignore applied to `relPath` (relative to that file's dir). */
function matchesGitignore(file, relPath) {
  const name = relPath.split("/").pop() ?? relPath;
  const rules = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  let ignored;
  for (const rule of rules) {
    const negate = rule.startsWith("!");
    const pattern = (negate ? rule.slice(1) : rule).replace(/^\//, "").replace(/\/$/, "");
    const re = globToRegExp(pattern);
    if (re.test(name) || re.test(relPath)) ignored = !negate;
  }
  return ignored;
}

/**
 * True if a .gitignore in the project or any parent directory ignores the file
 * (monorepos keep the rule at the repo root). The nearest file that has a
 * matching rule wins, like git.
 */
function gitignoreCovers(root, path) {
  let dir = join(root, dirname(path));
  const abs = join(root, path);
  for (;;) {
    const file = join(dir, ".gitignore");
    if (existsSync(file)) {
      const verdict = matchesGitignore(file, relative(dir, abs).split(sep).join("/"));
      if (verdict !== undefined) return verdict;
    }
    if (existsSync(join(dir, ".git"))) return false;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function decodeJwtRole(segment) {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

/** @param {{ root: string; files: import("../files.mjs").SourceFile[]; git: boolean }} ctx */
export function checkSecrets(ctx) {
  const findings = [];
  const useGit = ctx.git && insideGitRepo(ctx.root);
  const add = (file, index, finding) => {
    const line = file.lines ? content2line(file, index) : undefined;
    if (line && isSuppressed(file, line, finding.check)) return;
    findings.push({
      category: "secrets",
      file: file.path,
      line,
      snippet: line ? snippet(file, line) : undefined,
      ...finding,
    });
  };

  for (const file of ctx.files) {
    const isEnv = ENV_FILE.test(file.path);
    const isTemplate = isEnv && ENV_TEMPLATE.test(file.path);

    // 1. Env files that would end up in git.
    let envCommitted = false;
    if (isEnv && !isTemplate) {
      const tracked = useGit ? isTracked(ctx.root, file.path) : false;
      const ignored = useGit ? !tracked : gitignoreCovers(ctx.root, file.path);
      if (tracked || !ignored) {
        envCommitted = true;
        add(file, 0, {
          check: tracked ? "env-file-committed" : "env-file-not-ignored",
          severity: "high",
          title: tracked
            ? "Environment file is committed to git"
            : "Environment file is not git-ignored",
          why: "Env files hold real credentials. Anything in git history is effectively public to everyone with repo access, forever.",
          fix: "Add `.env*` (with `!.env.example`) to .gitignore, remove the file from git (`git rm --cached`), and rotate every secret it contained.",
        });
      }
    }

    // 2. Hard-coded secrets in source (and in committed env files).
    const scanForSecrets = !isTestFile(file.path) && (!isEnv || envCommitted) && !isTemplate;
    if (scanForSecrets) {
      for (const pattern of SECRET_PATTERNS) {
        for (const match of file.content.matchAll(pattern.re)) {
          add(file, match.index, {
            check: "hardcoded-secret",
            severity: pattern.severity,
            title: `${pattern.name} in source`,
            why: "Secrets in code are exposed to anyone who can read the repository or the built bundle.",
            fix: "Move it to an environment variable validated at startup, and rotate the key (it must be considered leaked).",
          });
        }
      }
      for (const match of file.content.matchAll(JWT)) {
        if (decodeJwtRole(match[1]) !== "service_role") continue;
        add(file, match.index, {
          check: "hardcoded-secret",
          severity: "high",
          title: "Supabase service_role key in source",
          why: "The service_role key bypasses all row level security.",
          fix: "Keep it server-only in an environment variable and rotate it in the Supabase dashboard.",
        });
      }
      for (const match of file.content.matchAll(DB_URL)) {
        const [, , password, host] = match;
        if (LOCAL_HOSTS.test(host) || PLACEHOLDER.test(password) || PLACEHOLDER.test(host))
          continue;
        add(file, match.index, {
          check: "hardcoded-secret",
          severity: "high",
          title: "Database URL with password in source",
          why: "A connection string with credentials gives direct access to your data.",
          fix: "Read it from `DATABASE_URL` and rotate the database password.",
        });
      }
    }

    // 3. Secret-looking variables exposed to the browser.
    if (!isTestFile(file.path)) {
      const seen = new Set();
      for (const match of file.content.matchAll(PUBLIC_PREFIX)) {
        const name = match[0];
        const bare = name.slice(match[1].length);
        if (seen.has(name) || !SECRET_NAME.test(bare) || PUBLIC_BY_DESIGN.test(bare)) continue;
        seen.add(name);
        add(file, match.index, {
          check: "public-env-secret",
          severity: "high",
          title: `Secret-looking variable \`${name}\` is exposed to the browser`,
          why: `Variables prefixed with ${match[1]} are inlined into the client bundle and visible to every visitor.`,
          fix: `Rename it without the ${match[1]} prefix and only read it on the server (route handlers, server actions, server components).`,
        });
      }
    }

    // 4. Server secrets referenced from client components.
    if (isClientFile(file) && !isTestFile(file.path)) {
      for (const match of file.content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = match[1];
        if (/^(NEXT_PUBLIC_|NODE_ENV$)/.test(name)) continue;
        const critical = /SERVICE_ROLE|SECRET|PRIVATE/.test(name);
        add(file, match.index, {
          check: "client-secret-env",
          severity: critical ? "high" : "medium",
          title: `Client component reads server variable \`${name}\``,
          why: "Client components run in the browser. The value is undefined there unless it is inlined, in which case it leaks; either way the secret-handling code belongs on the server.",
          fix: "Move the logic that needs this variable to a server action, route handler or server component.",
        });
      }
    }

    // 5. next.config `env` inlines values into the client bundle.
    if (/(^|\/)next\.config\.[mc]?[jt]s$/.test(file.path)) {
      const envBlock = /\benv\s*:\s*\{([^}]*)\}/.exec(file.content);
      if (envBlock) {
        for (const match of envBlock[1].matchAll(/([A-Z0-9_]+)\s*:/g)) {
          if (!SECRET_NAME.test(match[1]) || PUBLIC_BY_DESIGN.test(match[1])) continue;
          add(file, envBlock.index + envBlock[0].indexOf(match[0]), {
            check: "public-env-secret",
            severity: "high",
            title: `\`${match[1]}\` is inlined into the client bundle by next.config \`env\``,
            why: "Values in next.config `env` are replaced at build time in client code too.",
            fix: "Remove it from `env` and read `process.env` only on the server.",
          });
        }
      }
    }
  }
  return findings;
}

function content2line(file, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (file.content.charCodeAt(i) === 10) line++;
  return line;
}
