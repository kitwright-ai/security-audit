import { betterAuth } from "better-auth";

export const auth = betterAuth({ emailAndPassword: { enabled: true } });

type Ctx = { organizationId: string; userId: string };
export function withAuth<T>(_opts: object, handler: (ctx: Ctx & { input: T }) => Promise<unknown>) {
  return (input: T) => handler({ organizationId: "org", userId: "u", input });
}
export function withAuthRoute(_opts: object, handler: (ctx: Ctx) => Promise<Response>) {
  return () => handler({ organizationId: "org", userId: "u" });
}
export async function requireUser() {
  return { userId: "u", organizationId: "org" };
}
export async function rateLimit(_key: string) {}
