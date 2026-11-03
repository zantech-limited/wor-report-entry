export type ContentSecurityOptions = {
  nonce: string;
  https: boolean;
  /** Work-order PDFs are shown in a same-origin frame. */
  allowFrame: boolean;
  development: boolean;
};

/** 16 random bytes, base64. Safe to embed in a CSP nonce token. */
export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Page policy. Scripts need a per-request nonce. Style attributes on the
 * customer form stay allowed: a nonce in style-src would ignore
 * 'unsafe-inline' and block those attributes. That layout is not part of
 * the signed snapshot.
 */
export function contentSecurityPolicy(options: ContentSecurityOptions) {
  if (!/^[A-Za-z0-9+/]+=*$/.test(options.nonce))
    throw new Error("Invalid content security nonce.");
  const script = [
    "'self'",
    `'nonce-${options.nonce}'`,
    "'strict-dynamic'",
    options.development ? "'unsafe-eval'" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    options.allowFrame ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    options.https ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function requestIsHttps(request: {
  headers: { get(name: string): string | null };
  url: string;
  nextUrl?: { protocol: string };
}) {
  return (
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ===
      "https" ||
    request.nextUrl?.protocol === "https:" ||
    request.url.startsWith("https:")
  );
}
