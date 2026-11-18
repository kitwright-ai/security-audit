"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";

const input = z.object({ id: z.string() });

export async function deleteJob(raw: unknown) {
  const session = await auth.api.getSession({ headers: await headers() });
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) throw new Error("Unauthorized");
  const { id } = input.parse(raw);
  await db.delete(jobs).where(and(eq(jobs.id, id), eq(jobs.organizationId, organizationId)));
}
