# secure-app (stripe-audit fixture)

A Stripe integration that follows the patterns `stripe-audit` checks for, modelled on the
Kitwright billing module. The scanner must report **zero findings** here.

- Keys only in environment variables, validated at startup (`lib/env.ts`); pinned `apiVersion`.
- Checkout prices come from a server-side catalog; the client only sends a plan key.
- `client_reference_id` + `metadata` link every session to the organization.
- The webhook verifies the raw body, claims `event.id` in the same transaction as its effects,
  handles subscription updates/cancellations and failed payments, and returns 500 on failure.
- The success page only displays status; access is granted by the webhook.
- The middleware excludes the webhook from authentication.
