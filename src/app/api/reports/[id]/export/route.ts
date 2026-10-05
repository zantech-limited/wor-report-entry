import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { getReport, getReportBlob } from "@/lib/db";
import { templatePath, writeWorkbook } from "@/lib/excel";
import { fileMonthStamp } from "@/lib/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  try {
    const base = (await getReportBlob(id)) ?? readFileSync(templatePath());
    const file = await writeWorkbook(base, report);
    const who = report.preparedBy.trim() || "Service desk";
    const filename = `Monthly Service Report ${who} ${fileMonthStamp(report.lines)}.xlsm`;
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.ms-excel.sheet.macroEnabled.12",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not build the workbook.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
