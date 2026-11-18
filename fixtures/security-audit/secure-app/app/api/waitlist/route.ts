// security-audit: public — waitlist sign-up form
import { rateLimit } from "@/lib/auth";

export async function POST(request: Request) {
  await rateLimit(request.headers.get("x-forwarded-for") ?? "unknown");
  return Response.json({ ok: true });
}
