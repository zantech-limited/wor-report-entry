import { legacyAccess } from "@/lib/access";
import { currentActor } from "@/lib/accounts";
import { deleteFieldLineFromDesk } from "@/lib/field-jobs";
import { jsonBody } from "@/lib/http";
import { logEvent } from "@/lib/events";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; lineId: string }> },
) {
  const accessDenied = await legacyAccess(request, ["admin"]);
  if (accessDenied) return accessDenied;
  const actor = await currentActor(request.headers);
  if (!actor)
    return NextResponse.json(
      { error: "Sign in with an approved account." },
      { status: 401 },
    );
  const { id, lineId } = await context.params;
  try {
    const body = (await jsonBody(request, 4_000)) as { confirmWor?: unknown };
    const result = await deleteFieldLineFromDesk(
      actor,
      id,
      lineId,
      body.confirmWor,
    );
    return NextResponse.json({ deleted: true, ...result });
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : "";
    const safe =
      /^(Your role|Enter the exact|Work order|Invalid |That report)/.test(text)
        ? text
        : "Could not delete this work order.";
    if (safe === "Could not delete this work order.")
      logEvent("report.save_failed", "A field work order could not be deleted.", "error");
    const status = safe.startsWith("Your role")
      ? 403
      : safe.startsWith("Work order is not") || safe.includes("no longer saved")
        ? 404
        : 400;
    return NextResponse.json({ error: safe }, { status });
  }
}
