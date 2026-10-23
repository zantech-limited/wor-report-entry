import {legacyAccess} from "@/lib/access";
import { clientErrorMessage } from "@/lib/http";
import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { getReport, getReportBlob } from "@/lib/db";
import { templatePath, writeWorkbook, workbookFileType } from "@/lib/excel";
import { fileMonthStamp } from "@/lib/model";
import { logEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const accessDenied=await legacyAccess(_request,["admin","manager","supervisor"]);if(accessDenied)return accessDenied;
  const { id } = await context.params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  try {
    const base = (await getReportBlob(id)) ?? readFileSync(templatePath());
    const file = await writeWorkbook(base, report);
    const format = await workbookFileType(file);
    const who = report.preparedBy.trim() || "Service desk";
    const filename = `Monthly Service Report ${who} ${fileMonthStamp(report.lines,report.monthKey)}.${format.extension}`;
    logEvent("workbook.exported", `Exported an ${format.extension.toUpperCase()} workbook preserving its original format.`);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": format.contentType,
        "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (cause) {
    return NextResponse.json(
      { error: clientErrorMessage(cause, "Could not build the workbook.") },
      { status: 500 },
    );
  }
}
