import {legacyAccess} from "@/lib/access";
import { HttpError, jsonBody } from "@/lib/http";
import { NextResponse } from "next/server";
import { deleteReport, getReport, saveReportChecked } from "@/lib/db";
import { fieldJobIds } from "@/lib/field-jobs";
import type { Report } from "@/lib/model";
import { logEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const accessDenied=await legacyAccess(_request,["admin","manager","supervisor"]);if(accessDenied)return accessDenied;
  const { id } = await context.params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const tracked = new Set(await fieldJobIds());
  return NextResponse.json({
    report,
    fieldLineIds: report.lines.map((line) => line.id).filter((id) => tracked.has(id)),
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const accessDenied=await legacyAccess(request,["admin"]);if(accessDenied)return accessDenied;
  const { id } = await context.params;
  try {
    const body = (await jsonBody(request, 8_000_000)) as Report;
    const result = await saveReportChecked(id, body,
      new URL(request.url).searchParams.get("suggestions") === "if-changed" ? "when-changed" : "always");
    return NextResponse.json({ saved: true, ...result });
  } catch (cause) {
    if (cause instanceof HttpError)
      return NextResponse.json({ error: cause.message }, { status: cause.status });
    logEvent("report.save_failed", "A report could not be saved.", "error");
    const message = cause instanceof Error && /^(Recovery snapshot|Save conflict:|That report|Invalid |Report exceeds|Work orders|Storage migration|customer must|location must|technician must|secondaryTech must)/.test(cause.message) ? cause.message : "Could not save the report. Check the storage connection and try again.";
    const status = message.startsWith("Save conflict:") ? 409 : message.includes("no longer saved") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const accessDenied=await legacyAccess(_request,["admin"]);if(accessDenied)return accessDenied;
  const { id } = await context.params;
  await deleteReport(id);
  return NextResponse.json({ ok: true });
}
