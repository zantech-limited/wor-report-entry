import { NextResponse } from "next/server";
import { createBlankReport, listReports } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const reports = await listReports();
  return NextResponse.json({ reports });
}

export async function POST() {
  try {
    const report = await createBlankReport();
    return NextResponse.json({ id: report.id });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not start a new report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
