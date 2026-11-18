import { NextResponse } from "next/server";

const secret = process.env.SESSION_SECRET || "dev-session-secret";

export function middleware() {
  if (!secret) return new NextResponse("Misconfigured", { status: 500 });
  return NextResponse.next();
}
