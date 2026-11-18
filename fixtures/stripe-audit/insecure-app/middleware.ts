import { type NextRequest, NextResponse } from "next/server";

// Requires a session cookie on every API route — including the Stripe webhooks.
export function middleware(request: NextRequest) {
  if (!request.cookies.get("session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*"],
};
