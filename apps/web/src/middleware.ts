import { NextResponse, type NextRequest } from "next/server";

/**
 * Reconcile proxy-injected forwarding headers.
 *
 * Behind the hosted preview proxy, `x-forwarded-host` is rewritten to the
 * upstream host while the browser `origin` stays the public hosted URL.
 * Next.js Server Actions reject forwarded requests when those two disagree
 * ("Invalid Server Actions request"), which breaks the dashboard passcode
 * login. Normalize x-forwarded-host to match the caller's origin.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  const origin = headers.get("origin");
  const forwardedHost = headers.get("x-forwarded-host");

  if (origin && forwardedHost && forwardedHost !== origin) {
    headers.set("x-forwarded-host", new URL(origin).host);
    headers.set("x-forwarded-proto", new URL(origin).protocol.replace(":", ""));
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
