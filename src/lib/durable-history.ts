import { database } from "./storage";
import type { Report } from "./model";
export async function durableReportHistory(report: Report) {
  const db = await database(),
    id = `report-history:${report.id}:${report.updatedAt}`;
  if (!(await db.prepare("SELECT id FROM desk_records WHERE id = ?").get(id)))
    await db.query(
      "INSERT INTO desk_records (id,kind,owner_id,revision,data,updated_at) VALUES (?,?,?,?,?,?)",
      [
        id,
        "report-history",
        report.id,
        1,
        JSON.stringify({ format: "service-desk-draft", report }),
        report.updatedAt,
      ],
    );
  const old = await db.query(
    "SELECT id FROM desk_records WHERE kind = ? AND owner_id = ? ORDER BY updated_at DESC",
    ["report-history", report.id],
  );
  for (const row of old.slice(20))
    await db.query("DELETE FROM desk_records WHERE id = ?", [String(row.id)]);
}
