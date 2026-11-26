import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "pc_session";

/** Cheap pre-check: no session cookie → straight to /login. Role checks happen in the portal layouts. */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/merchant/:path*"],
};
