import { billing } from "@/lib/billing";

export const POST = (request: Request) => billing.handleWebhook(request);
