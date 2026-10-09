import assert from "node:assert/strict";
import { createBlankReport, saveReport, getReport, getSuggestions } from "../src/lib/db";
import { listEntryParts, listParts } from "../src/lib/parts";
import { database } from "../src/lib/storage";

async function main() {
  assert(process.env.DATA_DIR?.includes(".checks"));
  if (process.env.DB_ENGINE && process.env.DB_ENGINE !== "sqlite") assert(/^desk_test_/.test(process.env.DB_NAME ?? ""));
  const report = await createBlankReport();
  Object.assign(report.lines[0], { customer: "Fast save customer", location: "Site", technician: "Fast tech", serialNo: "FAST-SERIAL", modelNo: "Machine", partNo: "FAST-PART", description: "Part description", qty: "1", date: "2026-10-09" });
  const first = await saveReport(report.id, report, "when-changed");
  assert(first?.customers.includes("Fast save customer"));
  const db = await database();
  const query = db.query.bind(db);
  const statements: string[] = [];
  db.query = async (sql, values) => { statements.push(sql); return query(sql, values); };
  report.lines[0].comments = "A comment-only edit";
  report.lines[0].arrivalTime = "09:00";
  const ordinary = await saveReport(report.id, report, "when-changed");
  db.query = query;
  assert.equal(ordinary, undefined);
  assert(statements.every(sql => !/INSERT INTO (parts|suggestions)|SELECT lines FROM reports/.test(sql)), "Ordinary edits rebuilt the catalog or scanned all report histories");
  assert.equal((await getReport(report.id))?.lines[0].comments, "A comment-only edit");
  report.lines[0].modelNo = "Changed machine";
  const changed = await saveReport(report.id, report, "when-changed");
  assert.equal(changed?.machinesByCustomer["Fast save customer"][0].modelNo, "Changed machine");
  assert((await saveReport(report.id, report))?.customers.includes("Fast save customer"), "Existing callers lost their full suggestions response");
  const compact = await listEntryParts();
  const full = await listParts();
  assert.deepEqual(compact.map(p => [p.partNo,p.description,p.defaultQty,p.active]), full.map(p => [p.partNo,p.description,p.defaultQty,p.active]));
  assert((await getSuggestions()).techs.includes("Fast tech"));
  console.log(`Fast save checks passed (${db.config.engine}): ordinary edit ${statements.length} data queries; field changes refresh suggestions, old callers supported, Entry autofill preserved.`);
  await db.close();
}
main().catch(error => { console.error(error); process.exit(1); });
