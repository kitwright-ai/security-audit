"use server";

import { and, eq } from "drizzle-orm";
import { requireUser, withAuth } from "@/lib/auth";
import { db, plans, projects } from "@/lib/db";

export const createProject = withAuth(
  { permission: "project:create" },
  async ({ organizationId, input }) => {
    await db.insert(projects).values({ id: "p", organizationId, name: String(input) });
  },
);

export async function renameProject(id: string, name: string) {
  const user = await requireUser();
  await db
    .update(projects)
    .set({ name })
    .where(and(eq(projects.organizationId, user.organizationId), eq(projects.id, id)));
}

export async function listPlans() {
  await requireUser();
  return db.select().from(plans);
}
