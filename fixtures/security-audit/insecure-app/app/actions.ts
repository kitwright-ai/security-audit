"use server";

import { eq } from "drizzle-orm";
import { db, projects } from "@/lib/db";

// Callable by anyone, deletes any project.
export async function deleteProject(id: string) {
  await db.delete(projects).where(eq(projects.id, id));
}

export async function signUp(email: string) {
  return { email };
}
