import { createClient } from "@/lib/supabase/server";

export default async function BookingsPage() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  async function cancel(formData: FormData) {
    "use server";
    const client = await createClient();
    await client
      .from("bookings")
      .delete()
      .eq("id", String(formData.get("id")));
  }

  return (
    <form action={cancel}>
      <p>{user.user?.email}</p>
    </form>
  );
}
