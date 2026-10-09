import { NextResponse } from "next/server";
import { deleteReport, getReport, saveReport } from "@/lib/db";
import type { Report } from "@/lib/model";
import { logEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  return NextResponse.json({ report });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as Report;
    const suggestions = await saveReport(id, body,
      new URL(request.url).searchParams.get("suggestions") === "if-changed" ? "when-changed" : "always");
    return NextResponse.json({ saved: true, suggestions });
  } catch (cause) {
    logEvent("report.save_failed", "A report could not be saved.", "error");
    const message = cause instanceof Error && /^(That report|Invalid |Report exceeds|Work orders|Storage migration|customer must|location must|technician must|secondaryTech must)/.test(cause.message) ? cause.message : "Could not save the report. Check the storage connection and try again.";
    const status = message.includes("no longer saved") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  await deleteReport(id);
  return NextResponse.json({ ok: true });
}
