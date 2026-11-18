export const SEVERITIES = ["high", "medium", "low"];

export const CATEGORIES = {
  secrets: "Secrets and client exposure",
  auth: "Authentication of routes and server actions",
  tenancy: "Tenant / user scoping of queries",
  webhooks: "Webhook signature verification",
  hardening: "Rate limiting and security headers",
  supabase: "Supabase row level security",
};

/**
 * @typedef {{
 *   check: string; category: keyof typeof CATEGORIES; severity: "high" | "medium" | "low";
 *   title: string; file?: string; line?: number; snippet?: string; why: string; fix: string;
 * }} Finding
 */

const SUPPRESS = /security-audit-ignore(?:\s*:)?\s*([\w,\s-]*)/;

/**
 * True if the line (or the one above) has `security-audit-ignore` (optionally listing check ids),
 * or the file has `security-audit-ignore-file <check>`.
 */
export function isSuppressed(file, line, check) {
  const fileLevel = new RegExp(`security-audit-ignore-file\\s*:?\\s*[\\w,\\s-]*\\b${check}\\b`);
  if (fileLevel.test(file.content)) return true;
  for (const l of [line, line - 1]) {
    const text = file.lines[l - 1];
    if (!text) continue;
    const match = SUPPRESS.exec(text);
    if (!match || /security-audit-ignore-file/.test(text)) continue;
    const ids = (match[1] ?? "").split(/[\s,]+/).filter((id) => /^[a-z][\w-]+$/.test(id));
    if (ids.length === 0 || ids.includes(check)) return true;
  }
  return false;
}

/** Trimmed source line for display, secrets masked. */
export function snippet(file, line) {
  const text = (file.lines[line - 1] ?? "").trim();
  return maskSecrets(text.length > 160 ? `${text.slice(0, 157)}...` : text);
}

/** Masks long tokens that mix letters and digits (keys), keeping the first 6 characters. */
export function maskSecrets(text) {
  return text.replace(/[A-Za-z0-9_\-+/=]{16,}/g, (token) =>
    /\d/.test(token) && /[A-Za-z]/.test(token) ? `${token.slice(0, 6)}…` : token,
  );
}
