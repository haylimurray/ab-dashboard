import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the login page and auth API through
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const serverPassword = process.env.DASHBOARD_PASSWORD;

  // If no password is configured (local dev), skip protection
  if (!serverPassword) return NextResponse.next();

  const cookie = request.cookies.get("ab_auth")?.value;
  if (cookie !== serverPassword) {
    // API routes must return JSON — never redirect to an HTML login page,
    // because the browser will try to parse the HTML as JSON and crash.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
