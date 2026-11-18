"use client";

import { createClient } from "@supabase/supabase-js";

// Service role key in a client component bypasses RLS for every visitor.
export const admin = createClient(
  "https://x.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);
