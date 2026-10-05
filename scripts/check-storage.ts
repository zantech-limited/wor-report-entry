import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyPartLine } from "../src/lib/parts-model";

async function main() {
  assert(
    process.env.STORAGE_TEST === "1",
    "Set STORAGE_TEST=1 and use an isolated test database.",
  );
  assert(
    process.env.DATA_DIR?.includes(".checks"),
    "DATA_DIR must be an isolated .checks folder.",
  );
  if (process.env.DB_ENGINE && process.env.DB_ENGINE !== "sqlite")
    assert(
      /^desk_test_/.test(process.env.DB_NAME ?? ""),
      "Remote database names must start with desk_test_.",
    );
  const { database } = await import("../src/lib/storage");
  const {
    createBlankReport,
    saveReport,
    getReport,
    getReportBlob,
    getSuggestions,
    listWorkEntries,
    importWorkbook,
    deleteReport,
  } = await import("../src/lib/db");
  const { savePart, listParts } = await import("../src/lib/parts");
  const { saveTechnician } = await import("../src/lib/technicians");
  const { createBackup, restoreBackup, validateBackup } =
    await import("../src/lib/backups");
  const db = await database();
  assert.equal(
    Number((await db.query("SELECT COUNT(*) AS count FROM reports"))[0].count),
    0,
    "Test destination must be empty.",
  );
  const report = await createBlankReport();
  report.lines[0] = {
    ...report.lines[0],
    customer: "Test customer",
    location: "Site A",
    technician: "Primary",
    secondaryTech: "Assistant",
    date: "2026-10-05",
    serialNo: "4TVTEST",
    modelNo: "IR ADV DX 4845i",
    arrivalTime: "23:00",
    departureTime: "01:30",
    partNo: "A\nB",
    description: "First\nSecond",
    qty: "1\n2",
  };
  await saveReport(report.id, report);
  assert.deepEqual((await getReport(report.id))?.lines, report.lines);
  assert.equal((await listWorkEntries())[0].hours, 2.5);
  assert((await getSuggestions()).techs.includes("Assistant"));
  await saveTechnician({ name: "Assistant", active: false });
  assert(!(await getSuggestions()).techs.includes("Assistant"));
  await saveReport(report.id, report);
  assert(
    !(await getSuggestions()).techs.includes("Assistant"),
    "Saving history must not re-add a removed technician.",
  );
  assert.equal(
    (await getReport(report.id))?.lines[0].secondaryTech,
    "Assistant",
    "Removing a dropdown name changed historical work orders.",
  );
  await saveTechnician({ name: "Assistant", active: true });
  await savePart({
    partNo: "B",
    description: "Catalog second",
    defaultQty: "3",
    active: true,
  });
  const part = (await listParts()).find(part => part.partNo === "B")!;
  assert.deepEqual(
    applyPartLine("A\nB\nC", "First\nOld\nThird", "1\n2\n4", 1, part),
    {
      partNo: "A\nB\nC",
      description: "First\nCatalog second\nThird",
      qty: "1\n1\n4",
    },
  );
  await savePart({ ...part, active: false });
  assert(!(await listParts()).some(part => part.partNo === "B"));
  assert.equal((await listParts(true)).length, 2);
  const template = readFileSync("templates/monthly-service-report.xlsm");
  const imported = await importWorkbook(template, "test.xlsm");
  assert(Buffer.from((await getReportBlob(imported.id))!).equals(template));
  const backup = await createBackup();
  assert.equal(backup.reports.length, 2);
  assert.equal(backup.parts?.length, 2);
  await restoreBackup(backup);
  assert.equal(
    Number((await db.query("SELECT COUNT(*) AS count FROM reports"))[0].count),
    4,
  );
  assert.equal(
    (await listParts(true)).length,
    2,
    "Restore must preserve existing catalog records.",
  );
  assert.throws(() =>
    validateBackup({
      ...backup,
      reports: [{ ...backup.reports[0], lines: '[{"customer":null}]' }],
    }),
  );
  const before = (await db.query("SELECT COUNT(*) AS count FROM reports"))[0]
    .count;
  await assert.rejects(
    db.transaction(async () => {
      await db.query("DELETE FROM reports");
      throw new Error("rollback test");
    }),
  );
  assert.equal(
    (await db.query("SELECT COUNT(*) AS count FROM reports"))[0].count,
    before,
    "Transaction rollback failed.",
  );
  await deleteReport(report.id);
  assert.equal(await getReport(report.id), null);
  console.log(
    `storage checks passed: ${db.config.engine}; reports, suggestions, workbook blobs, parts, backup/restore, rollback, deletion`,
  );
  await db.close();
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
