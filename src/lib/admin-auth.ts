import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { dataDirectory } from "./storage";

export const adminCookie = "desk-admin";
export function initializeAdminAccess() {
  adminToken();
}
function adminToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  const filename = path.join(dataDirectory, "admin-token.txt");
  mkdirSync(dataDirectory, { recursive: true });
  if (!existsSync(filename)) {
    try {
      writeFileSync(filename, randomBytes(32).toString("hex"), {
        mode: 0o600,
        flag: "wx",
      });
    } catch (error) {
      if (!existsSync(filename)) throw error;
    }
  }
  return readFileSync(filename, "utf8").trim();
}
export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function verifyToken(token: string) {
  return equalSecret(token, adminToken());
}
function sign(value: string) {
  return createHmac("sha256", adminToken()).update(value).digest("hex");
}
export function createSession() {
  const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${expiry}.${sign(expiry)}`;
}
export function isAdmin(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${adminCookie}=`))
    ?.slice(adminCookie.length + 1);
  if (!cookie) return false;
  const [expiry, signature] = cookie.split(".");
  return (
    !!signature &&
    Number(expiry) > Date.now() &&
    equalSecret(signature, sign(expiry))
  );
}
export function requireAdmin(request: Request): NextResponse | null {
  if (!isAdmin(request))
    return NextResponse.json(
      { error: "Unlock Admin with your administrator token." },
      { status: 401 },
    );
  if (request.method !== "GET" && !sameOrigin(request))
    return NextResponse.json(
      { error: "Use the service desk's own Admin page." },
      { status: 403 },
    );
  return null;
}
export function sameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    // Next's standalone request URL uses the container's internal host/port.
    // The browser's Host header retains the external loopback port.
    return (
      origin.host === request.headers.get("host") &&
      origin.protocol === new URL(request.url).protocol
    );
  } catch {
    return false;
  }
}
const attempts = new Map<string, { count: number; until: number }>();
export function mayAttemptLogin() {
  // A global limit is suitable for this local desk and avoids trusting proxy IP headers.
  const entry = attempts.get("login");
  if (!entry || entry.until < Date.now()) {
    attempts.set("login", { count: 1, until: Date.now() + 60000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}
