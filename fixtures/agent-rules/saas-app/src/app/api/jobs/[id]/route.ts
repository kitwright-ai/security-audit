import { deleteJob } from "@/server/jobs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await deleteJob({ id: (await params).id });
  return new Response(null, { status: 204 });
}
