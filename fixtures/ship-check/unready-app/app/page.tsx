import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { data } = await supabase.from("services").select("*");
  console.log("services", data);
  return (
    <main>
      <img src="/hero.jpg" alt="Our team at work" />
      <h1>Fast, friendly plumbing</h1>
      {data?.map((s) => (
        <img key={s.id} src={s.photo_url} alt={s.name} />
      ))}
    </main>
  );
}
