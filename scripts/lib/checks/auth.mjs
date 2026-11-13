import { blockFrom, isServerActionFile, isTestFile, lineAt } from "../files.mjs";
import { isSuppressed, snippet } from "../findings.mjs";
import { AUTH_MARKERS, classifyRoutes, firstHandlerIndex, PUBLIC_ANNOTATION } from "../routes.mjs";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE", "ANY"]);

/** Actions that are public by nature (sign-in flows, public forms); rate limiting is checked instead. */
export const PUBLIC_ACTION =
  /^(login|logIn|signIn|signin|signUp|signup|register|resetPassword|forgotPassword|requestPasswordReset|sendMagicLink|verifyEmail|subscribe|joinWaitlist|addToWaitlist|contact|sendContact|createPublicBooking)\w*$/;

/** Names of local functions whose body authenticates (e.g. `async function requireOwner()`). */
function localAuthHelpers(content) {
  const names = [];
  const re =
    /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>\s*\{/g;
  for (const m of content.matchAll(re)) {
    const body = blockFrom(content, m.index + m[0].length - 1);
    if (AUTH_MARKERS.test(body)) names.push(m[1] ?? m[2]);
  }
  return names;
}

function authenticates(text, helpers) {
  if (AUTH_MARKERS.test(text)) return true;
  return helpers.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(text));
}

/** @param {{ files: import("../files.mjs").SourceFile[] }} ctx */
export function checkAuth(ctx) {
  const findings = [];
  const add = (file, index, finding) => {
    const line = lineAt(file.content, index);
    if (isSuppressed(file, line, finding.check)) return;
    findings.push({
      category: "auth",
      file: file.path,
      line,
      snippet: snippet(file, line),
      ...finding,
    });
  };

  // Route handlers.
  for (const route of classifyRoutes(ctx.files)) {
    if (route.kind !== "app" || isTestFile(route.file.path)) continue;
    const helpers = localAuthHelpers(route.file.content);
    if (authenticates(route.file.content, helpers)) continue;
    const mutating = route.methods.some((m) => MUTATING.has(m));
    add(route.file, firstHandlerIndex(route.file), {
      check: "route-without-auth",
      severity: mutating ? "high" : "medium",
      title: `Route handler \`${route.methods.join(", ")} ${route.url}\` has no authentication`,
      why: "Anyone on the internet can call this endpoint directly; the UI hiding a button does not protect it.",
      fix: "Authenticate and authorize at the start of every handler (e.g. wrap it in `withAuthRoute({ permission })`). If it is intentionally public, add a `// security-audit: public <reason>` comment and rate limit it.",
    });
  }

  // Server actions.
  for (const file of ctx.files) {
    if (isTestFile(file.path) || !file.content.includes("use server")) continue;
    const helpers = localAuthHelpers(file.content);

    if (isServerActionFile(file) && !PUBLIC_ANNOTATION.test(file.content)) {
      const exportRe =
        /export\s+(?:default\s+)?async\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{|export\s+const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>\s*\{|export\s+const\s+(\w+)\s*=\s*([\w.]+)\s*\(/g;
      for (const m of file.content.matchAll(exportRe)) {
        const name = m[1] ?? m[2] ?? m[3];
        if (PUBLIC_ACTION.test(name)) continue;
        if (m[3]) {
          // Wrapped: `export const x = withAuth(...)` / `authActionClient.action(...)`.
          if (/auth|protect|secure|private|guard/i.test(m[4] ?? "")) continue;
          const call = blockFromParen(file.content, m.index + m[0].length - 1);
          if (authenticates(call, helpers)) continue;
        } else {
          const body = blockFrom(file.content, m.index + m[0].length - 1);
          if (authenticates(body, helpers)) continue;
        }
        add(file, m.index, {
          check: "action-without-auth",
          severity: "high",
          title: `Server action \`${name}\` has no authentication`,
          why: 'Every exported function in a "use server" file is a public HTTP endpoint that anyone can call with any arguments.',
          fix: "Check the session and permission inside the action (e.g. `withAuth({ permission, input }, handler)`) and validate the input with Zod.",
        });
      }
    }

    // Inline `"use server"` inside a function (actions declared in server components).
    for (const m of file.content.matchAll(/\{\s*["']use server["']/g)) {
      if (isServerActionFile(file) && m.index < 40) continue;
      const body = blockFrom(file.content, m.index);
      if (authenticates(body, helpers)) continue;
      add(file, m.index, {
        check: "action-without-auth",
        severity: "high",
        title: "Inline server action has no authentication",
        why: "Inline server actions are callable endpoints too; being declared inside a protected page does not protect them.",
        fix: "Check the session and permission inside the action body.",
      });
    }
  }
  return findings;
}

function blockFromParen(content, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < content.length; i++) {
    if (content[i] === "(") depth++;
    if (content[i] === ")") {
      depth--;
      if (depth === 0) return content.slice(openIndex, i + 1);
    }
  }
  return content.slice(openIndex);
}
