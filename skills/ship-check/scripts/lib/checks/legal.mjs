import { locate } from "../files.mjs";
import { collector, withLocations } from "../items.mjs";

const ANALYTICS = [
  [
    /googletagmanager\.com|google-analytics\.com|\bgtag\s*\(|<GoogleAnalytics\b|<GoogleTagManager\b|react-ga4/,
    "Google Analytics / Tag Manager",
  ],
  [/connect\.facebook\.net|\bfbq\s*\(/, "Meta Pixel"],
  [/static\.hotjar\.com|\bhj\s*\(\s*["']/, "Hotjar"],
  [/clarity\.ms/, "Microsoft Clarity"],
  [/analytics\.tiktok\.com|\bttq\s*\./, "TikTok Pixel"],
  [/snap\.licdn\.com/, "LinkedIn Insight"],
  [/from\s+["']posthog-js["']/, "PostHog"],
  [/from\s+["']mixpanel-browser["']/, "Mixpanel"],
];

const CONSENT_DEPS =
  /cookie-?consent|cookiebot|usercentrics|klaro|iubenda|osano|termly|cookieyes|^c15t$|^@c15t\//i;
const CONSENT_CODE =
  /gtag\s*\(\s*["']consent["']|CookieConsent|CookieBanner|ConsentBanner|cookie-consent|consentGiven|hasConsent|consent_?state|usercentrics|cookiebot|cookieyes|klaro|iubenda|opt_out_capturing|opt_in_capturing/i;

/** A page under app/, pages/ or content/ whose path names the document. */
function findDocument(ctx, word) {
  const roots = [ctx.appDir, ctx.pagesDir, "content", "src/content"].filter(Boolean);
  const route = ctx.paths.find(
    (p) =>
      roots.some((r) => p.path.startsWith(`${r}/`)) &&
      new RegExp(`(^|/)[^/]*(${word})[^/]*(/page)?\\.(mdx?|[jt]sx?)$`, "i").test(p.path),
  );
  if (route) return route.path;
  // A link to a hosted policy (Termly, iubenda, a Notion page...) also counts.
  const link = new RegExp(`href=\\{?["'\`]https?://[^"'\`]*(${word})`, "i");
  return ctx.sourceFiles.find((f) => link.test(f.content))?.path;
}

/** @param {import("../project.mjs").Context} ctx */
export function checkLegal(ctx) {
  const { items, pass, warn } = collector("legal");
  if (!ctx.appDir && !ctx.pagesDir) return items;

  const docs = [
    {
      check: "privacy-policy",
      name: "privacy policy",
      word: "privacy|datenschutz|privacidad|confidentialite",
      why: "Required as soon as you collect any personal data (sign-up, contact form, analytics) under GDPR, UK GDPR and CCPA; Google OAuth verification and the app stores ask for its URL too.",
      route: "privacy",
    },
    {
      check: "terms",
      name: "terms of service",
      word: "terms|conditions|agb",
      why: "Without terms there are no stated rules on acceptable use, liability, refunds or termination, which matters most when the app takes payments or user content.",
      route: "terms",
    },
  ];
  for (const doc of docs) {
    const found = findDocument(ctx, doc.word);
    if (found)
      pass(doc.check, `${doc.name[0].toUpperCase()}${doc.name.slice(1)} found (\`${found}\`)`);
    else {
      warn(doc.check, `No ${doc.name} page`, {
        why: doc.why,
        fix: `Add a \`/${doc.route}\` page (for a client project, the client supplies or approves the text) and link it from the footer and sign-up form.`,
      });
    }
  }

  // Cookie consent when tracking scripts are loaded.
  const hits = [];
  const tools = new Set();
  for (const file of ctx.sourceFiles) {
    for (const [re, name] of ANALYTICS) {
      const m = re.exec(file.content);
      if (!m) continue;
      tools.add(name);
      hits.push(locate(file, m.index));
    }
  }
  if (tools.size > 0) {
    const consent =
      ctx.hasDep(CONSENT_DEPS) || ctx.sourceFiles.some((f) => CONSENT_CODE.test(f.content));
    if (consent) pass("cookie-consent", `Consent handling found for ${[...tools].join(", ")}`);
    else {
      warn("cookie-consent", `${[...tools].join(", ")} loaded without a cookie consent banner`, {
        ...withLocations(hits),
        why: "In the EU and UK, tracking cookies need opt-in consent before they are set; regulators and ad platforms both enforce it, and the client carries the liability.",
        fix: "Load the tracking scripts only after consent (a consent banner or a CMP, and Google Consent Mode for GA), or switch to a cookieless analytics tool. Required if any visitors are in the EU/UK.",
      });
    }
  }
  return items;
}
