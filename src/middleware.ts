import { NextRequest, NextResponse } from "next/server";
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-desk-path", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers } });
  const sameOriginPdf = /^\/api\/field\/jobs\/[^/]+\/pdf$/.test(
    request.nextUrl.pathname,
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", sameOriginPdf ? "SAMEORIGIN" : "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set(
    "Content-Security-Policy",
    sameOriginPdf
      ? "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
      : "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  );
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons|work-order-template.png).*)",
  ],
};
