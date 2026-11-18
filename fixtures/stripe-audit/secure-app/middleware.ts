import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (!request.cookies.get("session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // The Stripe webhook authenticates with its signature, not a session.
  matcher: ["/dashboard/:path*", "/api/((?!webhooks/).*)"],
};
