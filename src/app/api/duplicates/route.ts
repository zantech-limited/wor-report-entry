import { NextResponse } from "next/server";
import { whenReady } from "@/lib/db";
import { database } from "@/lib/storage";
import { fileMonthStamp, type WorkOrder } from "@/lib/model";
import { duplicateKey, duplicateFields } from "@/lib/duplicates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const reportId = params.get("report") ?? "";
  const wor = duplicateKey(params.get("wor") ?? "");
  const serial = duplicateKey(params.get("serial") ?? "");
  if ((!wor && !serial) || wor.length > 2048 || serial.length > 2048)
    return NextResponse.json({ matches: [], total: 0, counts: {wor: 0, serial: 0} });
  await whenReady();
  const rows = await (
    await database()
  ).query(
    "SELECT id, lines, source_filename, prepared_by FROM reports WHERE id <> ?",
    [reportId],
  );
  const matches = rows.flatMap((row) => {
    const lines = JSON.parse(String(row.lines)) as WorkOrder[];
    const workbook =
      row.source_filename ||
      `Monthly Service Report ${row.prepared_by || "Service desk"} ${fileMonthStamp(lines)}.xlsm`;
    return lines.flatMap((line, index) => {
      const fields = duplicateFields(wor, serial, line);
      return fields.length
        ? [
            {
              reportId: row.id,
              lineIndex: index,
              workbook,
              customer: line.customer,
              date: line.date,
              wor: line.wor,
              serialNo: line.serialNo,
              fields,
            },
          ]
        : [];
    });
  });
  return NextResponse.json({
    matches: matches.slice(0, 50),
    total: matches.length,
    counts: {
      wor: matches.filter(match => match.fields.includes("WOR")).length,
      serial: matches.filter(match => match.fields.includes("Serial")).length,
    },
  });
}
