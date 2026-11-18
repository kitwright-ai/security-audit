import {
  blockFrom,
  isPageFile,
  isRouteFile,
  isServerActionFile,
  isSourceFile,
  lineAt,
} from "../files.mjs";
import { isSuppressed, snippet } from "../findings.mjs";
import { SIGNATURE } from "../routes.mjs";

/** Expressions whose value comes from the client. */
const CLIENT_SOURCE =
  /\.json\(\s*\)|\b(?:req|request)\.(?:body|query)\b|\.formData\(\s*\)|\bformData\.get\(|\bsearchParams\b|\bparams\.\w+/;

const TYPE_WORDS = new Set([
  "number",
  "string",
  "boolean",
  "unknown",
  "any",
  "undefined",
  "null",
  "void",
  "async",
  "await",
]);

/** Removes string literals, `[...]` lookups and the arguments of non-coercing calls. */
function strip(expression) {
  let out = expression.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""').replace(/\[[^\]]*\]/g, "[]");
  for (;;) {
    const next = out.replace(
      /(?<=[\w$])(?<!\b(?:Number|parseInt|parseFloat|String|BigInt|Math\.\w+))\(([^()]*)\)/g,
      (m, args) => (args === "" ? m : "()"),
    );
    if (next === out) return out;
    out = next;
  }
}

function isClientControlled(expression, tainted) {
  const stripped = strip(expression);
  if (CLIENT_SOURCE.test(stripped)) return true;
  for (const name of tainted) {
    if (new RegExp(`(?<![.\\w$])${name.replace(/\$/g, "\\$")}\\b`).test(stripped)) return true;
  }
  return false;
}

/** Names in a destructuring pattern: `a, b: c, d = 1` → a, c, d. */
function destructuredNames(pattern) {
  return pattern
    .split(",")
    .map((part) => part.trim().replace(/^\.\.\./, ""))
    .map((part) => (part.includes(":") ? part.split(":")[1] : part))
    .map((part) => (part ?? "").split("=")[0]?.trim() ?? "")
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

/** Variables in `file` that hold client-controlled data. */
function taintedNames(file) {
  const tainted = new Set();

  // Server action arguments come straight from the browser.
  if (isServerActionFile(file)) {
    const fns = file.content.matchAll(
      /export\s+(?:default\s+)?async\s+function\s*\w*\s*\(([^)]*)\)|export\s+const\s+\w+\s*=\s*async\s*\(([^)]*)\)/g,
    );
    for (const m of fns) {
      for (const [name] of (m[1] ?? m[2] ?? "").matchAll(/\b[a-z_$][\w$]*\b/g)) {
        if (!TYPE_WORDS.has(name)) tainted.add(name);
      }
    }
  }

  const declarations = [
    ...file.content.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*(?::[^=]+)?=\s*([^;\n]+)/g),
    ...file.content.matchAll(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*([^;\n]+)/g,
    ),
  ].sort((a, b) => a.index - b.index);
  // Two passes so `const body = await req.json(); const { amount } = body;` propagates.
  for (let pass = 0; pass < 2; pass++) {
    for (const [, pattern, value] of declarations) {
      if (!isClientControlled(value, tainted)) continue;
      for (const name of destructuredNames(pattern)) tainted.add(name);
    }
  }
  return tainted;
}

/** Top-level `key: value` expression starting at `index` (after the colon). */
function valueAt(content, index) {
  let depth = 0;
  for (let i = index; i < content.length; i++) {
    const ch = content[i];
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) {
      if (depth === 0) return content.slice(index, i).trim();
      depth--;
    } else if ((ch === "," || ch === "\n") && depth === 0) return content.slice(index, i).trim();
  }
  return content.slice(index).trim();
}

const CREATE_CALL =
  /\b(checkout\.sessions|paymentIntents|paymentLinks|prices|invoiceItems)\.create\s*\(/g;
const PRICE_KEY = /\b(unit_amount|unit_amount_decimal|amount|price|line_items)\s*:\s*/g;
const PRICE_SHORTHAND = /[{,]\s*(unit_amount|amount|price|line_items)\s*(?=[,}])/g;

const SESSION_FROM_URL =
  /(?:searchParams|query|params)\??\.(?:get\(\s*["'`]session_id["'`]\s*\)|session_id\b)|\{[^}]*\bsession_id\b[^}]*\}\s*=\s*(?:await\s+)?[\w.]*(?:searchParams|query|params)/;
const DB_WRITE = /\.(?:update|updateMany|insert|upsert|create)\s*\(/g;

/** @param {{ files: import("../files.mjs").SourceFile[] }} ctx */
export function checkCheckout(ctx) {
  const findings = [];
  const add = (file, index, finding) => {
    const line = lineAt(file.content, index);
    if (isSuppressed(file, line, finding.check)) return;
    findings.push({
      category: "checkout",
      file: file.path,
      line,
      snippet: snippet(file, line),
      ...finding,
    });
  };

  for (const file of ctx.files) {
    if (!isSourceFile(file.path)) continue;

    // 1 + 2. Checkout / payment creation.
    if (file.content.includes(".create")) {
      const tainted = taintedNames(file);
      for (const call of file.content.matchAll(CREATE_CALL)) {
        const open = call.index + call[0].length - 1;
        const args = blockFrom(file.content, open);
        const brace = args.slice(1).search(/\S/) + 1;
        if (args[brace] !== "{") continue; // params built elsewhere: can't tell
        const params = blockFrom(args, brace);
        const offset = open + brace;

        let reported = false;
        const keys = [
          ...[...params.matchAll(PRICE_KEY)].map((m) => ({
            key: m[1],
            index: m.index,
            value: valueAt(params, m.index + m[0].length),
          })),
          ...[...params.matchAll(PRICE_SHORTHAND)].map((m) => ({
            key: m[1],
            index: m.index + m[0].indexOf(m[1]),
            value: m[1],
          })),
        ];
        for (const { key, index, value } of keys) {
          if (reported || !value || !isClientControlled(value, tainted)) continue;
          reported = true;
          const isPriceId = key === "price";
          add(file, offset + index, {
            check: "client-controlled-price",
            severity: isPriceId ? "medium" : "high",
            title: isPriceId
              ? `\`${call[1]}.create\` uses a price id sent by the client`
              : `\`${call[1]}.create\` uses an amount sent by the client`,
            why: isPriceId
              ? "The browser can send any price id from your Stripe account — an old discounted price, a $1 test price, a one-time price instead of the yearly plan — and Checkout will happily charge it."
              : "The browser decides how much it pays: anyone can change the request to pay 1 cent for the product, and the webhook will still fulfil the order.",
            fix: isPriceId
              ? "Accept a plan or product key from the client (validated with an enum) and map it to the price id on the server, e.g. `const price = PRICES[plan]` or a lookup by `lookup_key`."
              : "Never take amounts from the request. Look the product up on the server (catalog in code or the database) and use its Stripe price id, or compute the amount server-side from trusted data.",
          });
        }

        if (call[1] === "checkout.sessions") {
          if (/\bclient_reference_id\b|\bmetadata\b|\bcustomer\s*[:,}]|\.\.\./.test(params))
            continue;
          add(file, call.index, {
            check: "missing-reference",
            severity: "medium",
            title: "Checkout session doesn't link the payment to a user or organization",
            why: "Without `client_reference_id`, `metadata` or an existing `customer`, the webhook can only guess who paid (usually by email, which the buyer can change on the Checkout page), so access is granted to the wrong account or to nobody.",
            fix: "Pass `client_reference_id: organizationId` (or the user id) and the same id in `metadata` (and `subscription_data.metadata` for subscriptions), and read it back in the webhook.",
          });
        }
      }
    }

    // 3. Access granted from the success redirect.
    const isEntryPoint =
      isPageFile(file.path) || isRouteFile(file.path) || isServerActionFile(file);
    if (isEntryPoint && !SIGNATURE.test(file.content) && SESSION_FROM_URL.test(file.content)) {
      const verified =
        /\bsessions\.retrieve\s*\(/.test(file.content) && /\bpayment_status\b/.test(file.content);
      if (verified) continue;
      for (const write of file.content.matchAll(DB_WRITE)) {
        const lineText = file.lines[lineAt(file.content, write.index) - 1] ?? "";
        if (/\bstripe\./.test(lineText)) continue;
        add(file, write.index, {
          check: "fulfillment-on-success-page",
          severity: "high",
          title: `\`${file.path}\` grants access from the checkout success redirect`,
          why: "The success URL is just a link: anyone can open it with any `session_id` (or none) without paying, and asynchronous payment methods redirect before the money has settled. Access granted here is free access.",
          fix: 'Grant access only from the verified webhook (`checkout.session.completed` with `payment_status === "paid"`). The success page should only show status. If you also fulfil there, retrieve the session with `stripe.checkout.sessions.retrieve`, check `payment_status` and the owner, and share one idempotent fulfil function with the webhook.',
        });
        break;
      }
    }
  }
  return findings;
}
