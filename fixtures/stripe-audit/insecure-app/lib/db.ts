import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";

export const db = drizzle(process.env.DATABASE_URL ?? "");
export const users = pgTable("users", { id: text("id"), plan: text("plan") });
export const orders = pgTable("orders", {
  id: text("id"),
  email: text("email"),
  paid: boolean("paid"),
});
