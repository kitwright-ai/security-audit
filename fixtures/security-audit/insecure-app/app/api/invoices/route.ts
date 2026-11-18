import { db, invoices } from "@/lib/db";

// No authentication and no tenant filter: lists every customer's invoices.
export async function GET() {
  const rows = await db.select().from(invoices);
  return Response.json(rows);
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  await db.delete(invoices);
  return Response.json({ deleted: id });
}
