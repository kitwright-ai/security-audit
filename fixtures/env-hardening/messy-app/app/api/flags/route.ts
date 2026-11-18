export async function GET() {
  return Response.json({ beta: process.env.FEATURE_BETA === "true" });
}
