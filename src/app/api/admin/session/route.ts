import {accountsEnabled,currentActor} from "@/lib/accounts";
import { NextResponse } from "next/server";
import {
  adminCookie,
  initializeAdminAccess,
  createSession,
  isAdmin,
  mayAttemptLogin,
  sameOrigin,
  verifyToken,
} from "@/lib/admin-auth";
import { logEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if(accountsEnabled())return NextResponse.json({authenticated:(await currentActor(request.headers))?.role==="admin"});
  initializeAdminAccess();
  return NextResponse.json({ authenticated: isAdmin(request) });
}
export async function POST(request: Request) {
  if(accountsEnabled())return NextResponse.json({error:"Use your named account to sign in."},{status:403});
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Sign in from the Admin page." },
      { status: 403 },
    );
  if (!mayAttemptLogin())
    return NextResponse.json(
      { error: "Too many attempts. Wait one minute." },
      { status: 429 },
    );
  if (Number(request.headers.get("content-length") || 0) > 4096)
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  const text = await request.text();
  if (text.length > 4096)
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  let body: { token?: unknown };
  try {
    const parsed = text ? JSON.parse(text) : {};
    body = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.token !== "string" || !verifyToken(body.token)) {
    logEvent("admin.login", "Administrator token rejected.", "error");
    return NextResponse.json(
      { error: "That administrator token is incorrect." },
      { status: 401 },
    );
  }
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(adminCookie, createSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: forwarded
      ? forwarded === "https"
      : new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  logEvent("admin.login", "Administrator signed in.");
  return response;
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Use the Admin page." }, { status: 403 });
  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete(adminCookie);
  return response;
}
