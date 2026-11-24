import { NextResponse, type NextRequest } from "next/server";

/**
 * Reconcile proxy-injected forwarding headers, and rewrite the root route
 * to the login page.
 *
 * Root route: the Obvious hosted proxy internally follows 3xx responses,
 * so a server redirect from `/` would leave the browser on URL `/` while
 * actually serving /login — and the login Server Action's POST would then
 * target `/`, where the redirect swallows it and login silently fails. A
 * rewrite serves /login at URL `/` with HTTP 200 in a single hop, so the
 * form's action executes. page.tsx keeps a redirect as a fallback for
 * requests that bypass the middleware.
 *
 * Forwarding headers: behind the hosted preview proxy, `x-forwarded-host`
 * is rewritten to the upstream host while the browser `origin` stays the
 * public hosted URL. Next.js Server Actions reject forwarded requests when
 * those two disagree ("Invalid Server Actions request"), which breaks the
 * dashboard passcode login. Normalize x-forwarded-host to match the
 * caller's origin.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/login", request.url));
  }

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
