import { NextResponse } from "next/server";
import { deleteReport, getReport, saveReport } from "@/lib/db";
import type { Report } from "@/lib/model";

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
    const suggestions = await saveReport(id, body);
    return NextResponse.json({ suggestions });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not save the report.";
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
