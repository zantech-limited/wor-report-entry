import { NextRequest, NextResponse } from "next/server";
import {
  contentSecurityPolicy,
  createNonce,
  requestIsHttps,
} from "./lib/content-security";

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-desk-path", request.nextUrl.pathname);
  const https = requestIsHttps(request);
  const sameOriginPdf = /^\/api\/field\/jobs\/[^/]+\/pdf$/.test(
    request.nextUrl.pathname,
  );
  const nonce = createNonce();
  const policy = contentSecurityPolicy({
    nonce,
    https,
    allowFrame: sameOriginPdf,
    development: process.env.NODE_ENV === "development",
  });
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", sameOriginPdf ? "SAMEORIGIN" : "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  if (https)
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains",
    );
  response.headers.set("Content-Security-Policy", policy);
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons|work-order-template.png).*)",
  ],
};
