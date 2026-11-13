import { eq } from "drizzle-orm";
import { db, invoices } from "@/lib/db";
import { getSession } from "@/lib/session";

// Authenticated, but deletes by id only: any user can delete another organization's invoice.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  await db.delete(invoices).where(eq(invoices.id, params.id));
  return new Response(null, { status: 204 });
}
