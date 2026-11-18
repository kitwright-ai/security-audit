import { db, users } from "@/lib/db";

// Grants access to whoever opens the success URL.
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  if (session_id) {
    await db.update(users).set({ plan: "pro" });
  }
  return <h1>Welcome to Pro!</h1>;
}
