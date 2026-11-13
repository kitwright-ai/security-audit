import { db, projects } from "@/lib/db";

export default function Page() {
  async function rename(formData: FormData) {
    "use server";
    await db.update(projects).set({ name: String(formData.get("name")) });
  }
  return <form action={rename} />;
}
