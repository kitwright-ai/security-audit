CREATE TABLE "jobs" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL,
  "title" text NOT NULL,
  "price_cents" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
