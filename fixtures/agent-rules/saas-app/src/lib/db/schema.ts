import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  title: text("title").notNull(),
  priceCents: integer("price_cents").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
