import { db } from "@/lib/db";

export default async function Dashboard() {
  const rows = await db.execute("select id, name from services");
  return <pre>{JSON.stringify(rows, null, 2)}</pre>;
}
