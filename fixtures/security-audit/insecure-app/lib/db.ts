import { pgTable, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";

export const db = drizzle(process.env.DATABASE_URL ?? "");
export const invoices = pgTable("invoices", {
  id: text("id"),
  organizationId: text("organization_id"),
});
export const projects = pgTable("projects", { id: text("id"), name: text("name") });
