import { handleStripeWebhook } from "@/lib/billing";

export const POST = (request: Request) => handleStripeWebhook(request);
