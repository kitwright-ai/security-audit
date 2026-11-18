import { db } from "../lib/db";

await db.execute("insert into services (name) values ('Repair') on conflict do nothing");
console.log("Seeded services");
