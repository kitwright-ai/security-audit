import { and, eq } from "drizzle-orm";
import { withAuthRoute } from "@/lib/auth";
import { db, projects } from "@/lib/db";

export const GET = withAuthRoute({ permission: "project:read" }, async ({ organizationId }) => {
  const rows = await db.select().from(projects).where(eq(projects.organizationId, organizationId));
  return Response.json(rows);
});

export const DELETE = withAuthRoute(
  { permission: "project:delete" },
  async ({ organizationId }) => {
    await db.delete(projects).where(and(eq(projects.organizationId, organizationId)));
    return new Response(null, { status: 204 });
  },
);
