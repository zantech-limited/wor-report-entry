import { NextResponse } from "next/server";
import { importWorkbook } from "@/lib/db";
import { isBlankLine } from "@/lib/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an .xlsm workbook to import." }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "That workbook is larger than 20 MB." }, { status: 400 });
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsm") && !name.endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Import an .xlsm (or .xlsx) file with the same Master sheet." },
        { status: 400 },
      );
    }
    const report = await importWorkbook(Buffer.from(await file.arrayBuffer()), file.name);
    return NextResponse.json({
      id: report.id,
      lineCount: report.lines.filter((line) => !isBlankLine(line)).length,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not import that workbook.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
