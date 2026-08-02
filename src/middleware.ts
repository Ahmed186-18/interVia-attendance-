import { NextRequest, NextResponse } from "next/server";

const publicPaths = ["/login", "/api/auth/login", "/api/cron/"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;

  // Static files in /public must stay accessible before authentication.
  // Otherwise image requests are redirected to /login and render as broken images.
  if (pathname.startsWith("/_next/") || /\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next();
  }

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    if (token && pathname === "/login") {
      return NextResponse.redirect(new URL("/my-day", request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
