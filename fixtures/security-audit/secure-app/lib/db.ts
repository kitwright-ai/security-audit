import { pgTable, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";

export const db = drizzle(process.env.DATABASE_URL ?? "");
export const projects = pgTable("projects", {
  id: text("id"),
  organizationId: text("organization_id"),
  name: text("name"),
});
export const plans = pgTable("plans", { id: text("id"), name: text("name") });
