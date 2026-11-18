import { locate } from "../files.mjs";
import { collector, withLocations } from "../items.mjs";

const PROVIDERS = [
  [/^resend$/, "Resend"],
  [/^@sendgrid\/mail$/, "SendGrid"],
  [/^postmark$/, "Postmark"],
  [/^mailgun\.js$/, "Mailgun"],
  [/^@aws-sdk\/client-sesv?2?$/, "Amazon SES"],
  [/^@mailchimp\/mailchimp_transactional$/, "Mailchimp Transactional"],
  [/^mailersend$/, "MailerSend"],
  [/^@getbrevo\/brevo$|^sib-api-v3-sdk$/, "Brevo"],
  [/^loops$/, "Loops"],
  [/^@plunk\/node$/, "Plunk"],
  [/^nodemailer$/, "SMTP (nodemailer)"],
];

/** Resend's shared test sender: it only delivers to the account owner's own address. */
const TEST_SENDER = /onboarding@resend\.dev/g;

/** Email providers the project sends through. */
export function detectEmailProviders(ctx) {
  const deps = Object.keys(ctx.deps);
  return [...new Set(PROVIDERS.filter(([re]) => deps.some((d) => re.test(d))).map(([, n]) => n))];
}

/** @param {import("../project.mjs").Context} ctx */
export function checkEmail(ctx) {
  const { items, warn, manual } = collector("email");
  const providers = detectEmailProviders(ctx);
  const supabaseAuth = ctx.sourceFiles.some((f) =>
    /\.auth\.(signUp|signInWithOtp|resetPasswordForEmail)\s*\(/.test(f.content),
  );

  if (providers.length > 0) {
    const senders = [];
    for (const file of ctx.sourceFiles) {
      for (const m of file.content.matchAll(TEST_SENDER)) senders.push(locate(file, m.index));
    }
    if (senders.length > 0) {
      warn("test-sender", "Email is sent from a test address", {
        ...withLocations(senders),
        why: "`onboarding@resend.dev` only delivers to the email address of your own Resend account: customers never get the email.",
        fix: "Verify your own sending domain with the provider and send from an address on it, read from an environment variable (e.g. `EMAIL_FROM`).",
      });
    }
    manual("email-dns", `SPF, DKIM and DMARC for the sending domain (${providers.join(", ")})`, {
      why: "Without them, password resets, invoices and notifications land in spam or are rejected; Gmail and Yahoo reject bulk mail from unauthenticated domains.",
      fix: "Add the DNS records your provider shows for the domain, wait until it reports them as verified, add a DMARC record (`v=DMARC1; p=none; rua=mailto:...` to start), and send a test to Gmail and Outlook.",
    });
  }

  if (ctx.hasDep(/^@supabase\//) && supabaseAuth) {
    manual("supabase-smtp", "Custom SMTP for Supabase Auth emails", {
      why: "Supabase's built-in email service is for testing: it sends only a few emails per hour and only to team members' addresses, so sign-up confirmations and password resets fail for real users.",
      fix: "In Supabase → Authentication → Emails → SMTP settings, configure your email provider's SMTP, and customize the email templates and sender name.",
    });
  }
  return items;
}
