import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/admin-auth";
import {
  adminTokenConfigured,
  diagnosticReport,
  diagnosticsAuthorized,
  diagnosticsCookie,
  diagnosticsCookieOptions,
  diagnosticsSessionValid,
  diagnosticsSessionValue,
  mayAttemptDiagnosticsAuth,
  mayAttemptDiagnosticsProbe,
  probeDatabase,
} from "@/lib/diagnostics";
import { debugAccess, debugDesk } from "@/lib/debug-desk";
import { HttpError, jsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const missingToken =
  "ADMIN_TOKEN is not set for this deployment. Add it in this environment's settings and redeploy.";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}

function tooMany() {
  const response = NextResponse.json(
    { error: "Too many attempts. Wait one minute." },
    { status: 429 },
  );
  response.headers.set("Retry-After", "60");
  return noStore(response);
}

function denied() {
  return noStore(
    NextResponse.json({ error: "That administrator token is incorrect." }, { status: 401 }),
  );
}

function failed(error: unknown) {
  console.error("Diagnostics request failed", {
    name: error instanceof Error ? error.name : "Unknown",
  });
  return noStore(
    NextResponse.json({ error: "Diagnostics could not be completed." }, { status: 500 }),
  );
}

async function authorizedPayload(request: Request, force = false) {
  const access = await debugAccess(request);
  if (!force && !access.allowed) return null;
  return {
    report: diagnosticReport(),
    debug: await debugDesk(access.actor, access.accountState),
  };
}

export async function GET(request: Request) {
  try {
    const configured = adminTokenConfigured();
    const payload = await authorizedPayload(request);
    return noStore(
      NextResponse.json({
        configured,
        ...(payload || {}),
      }),
    );
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return noStore(
      NextResponse.json(
        { error: "Use the diagnostics page on this deployment." },
        { status: 403 },
      ),
    );
  let body: { action?: unknown; token?: unknown };
  try {
    const parsed = await jsonBody(request, 4096);
    body = parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "Invalid JSON request.";
    const status = error instanceof HttpError ? error.status : 400;
    return noStore(NextResponse.json({ error: message }, { status }));
  }
  const action = body.action;
  if (action === "lock") {
    const response = NextResponse.json({ configured: adminTokenConfigured(), locked: true });
    response.cookies.set(diagnosticsCookie, "", { ...diagnosticsCookieOptions(request), maxAge: 0 });
    return noStore(response);
  }
  if (!adminTokenConfigured()) {
    if (!(await mayAttemptDiagnosticsAuth())) return tooMany();
    return noStore(
      NextResponse.json({ configured: false, error: missingToken }, { status: 503 }),
    );
  }
  const presented = typeof body.token === "string" ? body.token : "";
  if (action === "unlock") {
    if (!(await mayAttemptDiagnosticsAuth())) return tooMany();
    if (!diagnosticsAuthorized(presented)) return denied();
    try {
      const payload = await authorizedPayload(request, true);
      const response = NextResponse.json({ configured: true, ...(payload || { report: diagnosticReport() }) });
      response.cookies.set(diagnosticsCookie, diagnosticsSessionValue(), diagnosticsCookieOptions(request));
      return noStore(response);
    } catch (error) {
      return failed(error);
    }
  }
  if (action === "test") {
    const cookieOk = diagnosticsSessionValid(request.headers.get("cookie"));
    if (!cookieOk) {
      if (!(await mayAttemptDiagnosticsAuth())) return tooMany();
      if (!diagnosticsAuthorized(presented)) return denied();
    }
    if (!(await mayAttemptDiagnosticsProbe())) return tooMany();
    try {
      const probe = await probeDatabase();
      const payload = await authorizedPayload(request, true);
      const response = NextResponse.json({
        configured: true,
        ...(payload || { report: diagnosticReport() }),
        probe,
      });
      if (!cookieOk)
        response.cookies.set(
          diagnosticsCookie,
          diagnosticsSessionValue(),
          diagnosticsCookieOptions(request),
        );
      return noStore(response);
    } catch (error) {
      return failed(error);
    }
  }
  if (!(await mayAttemptDiagnosticsAuth())) return tooMany();
  return noStore(NextResponse.json({ error: "Unknown diagnostics action." }, { status: 400 }));
}
