import { lineAt } from "../files.mjs";
import { isSuppressed, snippet } from "../findings.mjs";
import { classifyRoutes, firstHandlerIndex } from "../routes.mjs";

export const SIGNATURE_MARKERS =
  /constructEvent(?:Async)?\s*\(|webhooks\.(?:verify|unwrap|constructEvent)|new\s+Webhook\s*\(|\.verify\s*\(|verifySignature|verifyWebhook|validateWebhook|validateSignature|timingSafeEqual|createHmac|handleWebhook\s*\(|verifyKey\s*\(/;

/** @param {{ files: import("../files.mjs").SourceFile[] }} ctx */
export function checkWebhooks(ctx) {
  const findings = [];
  for (const route of classifyRoutes(ctx.files)) {
    if (route.kind !== "webhook") continue;
    const { file } = route;

    if (!SIGNATURE_MARKERS.test(file.content)) {
      const line = lineAt(file.content, firstHandlerIndex(file));
      if (isSuppressed(file, line, "webhook-without-signature")) continue;
      findings.push({
        check: "webhook-without-signature",
        category: "webhooks",
        severity: "high",
        title: `Webhook \`${route.url}\` does not verify the sender's signature`,
        file: file.path,
        line,
        snippet: snippet(file, line),
        why: 'Anyone can POST a fake event (e.g. "payment succeeded") to this URL and the app will act on it.',
        fix: "Verify the signature on the raw body before doing anything, e.g. `stripe.webhooks.constructEventAsync(await request.text(), signature, secret)`, and make processing idempotent by event id.",
      });
      continue;
    }

    // Verifying a re-serialized JSON body fails or, worse, is "fixed" by skipping verification.
    const json = /await\s+(?:req|request)\.json\(\)/.exec(file.content);
    if (json && /constructEvent|webhooks\.|verify/i.test(file.content)) {
      const line = lineAt(file.content, json.index);
      if (isSuppressed(file, line, "webhook-parsed-body")) continue;
      findings.push({
        check: "webhook-parsed-body",
        category: "webhooks",
        severity: "medium",
        title: `Webhook \`${route.url}\` parses JSON instead of verifying the raw body`,
        file: file.path,
        line,
        snippet: snippet(file, line),
        why: "Signatures are computed over the exact raw bytes. `JSON.stringify(await request.json())` changes them, so verification is wrong or ends up disabled.",
        fix: "Read the body once with `await request.text()`, verify it, then parse the verified event.",
      });
    }
  }
  return findings;
}
