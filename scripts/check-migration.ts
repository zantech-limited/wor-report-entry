import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

async function main() {
  assert(
    process.env.STORAGE_TEST === "1" &&
      process.env.DATA_DIR?.includes(".checks"),
    "Use an isolated test directory.",
  );
  assert(
    /^desk_test_/.test(process.env.TARGET_DATABASE ?? ""),
    "Use a disposable destination database.",
  );
  const { database, Storage, configPath, dataDirectory, writesPaused } =
    await import("../src/lib/storage");
  const { createBlankReport, saveReport, importWorkbook } =
    await import("../src/lib/db");
  const { savePart } = await import("../src/lib/parts");
  const { saveTechnician } = await import("../src/lib/technicians");
  const { createBackup, migrateStorage, snapshot } =
    await import("../src/lib/backups");
  const source = await database();
  assert.equal(source.config.engine, "sqlite");
  const report = await createBlankReport();
  report.lines[0].customer = "Migration fixture";
  report.lines[0].partNo = "P1\nP2";
  report.lines[0].description = "First\nSecond";
  await saveReport(report.id, report);
  await importWorkbook(
    readFileSync("templates/monthly-service-report.xlsm"),
    "fixture.xlsm",
  );
  await savePart({
    partNo: "P1",
    description: "Catalog fixture",
    defaultQty: "2",
    active: true,
  });
  await saveTechnician({ name: "Removed fixture", active: false });
  const before = await createBackup();
  const config = {
    engine: process.env.TARGET_ENGINE as "mysql" | "postgres",
    host: "127.0.0.1",
    port: Number(process.env.TARGET_PORT),
    database: process.env.TARGET_DATABASE!,
    username: "service_desk",
    password: "local-test-password",
    tls: false,
  };
  const result = await migrateStorage(config);
  assert.equal(result.reports, 2);
  assert(writesPaused());
  assert(existsSync(path.join(dataDirectory, "backups", result.backupFile)));
  assert.equal(
    JSON.parse(readFileSync(configPath, "utf8")).engine,
    config.engine,
  );
  const target = new Storage(config);
  try {
    const after = await snapshot(target);
    assert.deepEqual(after.reports, before.reports);
    assert.deepEqual(after.parts, before.parts);
    assert.deepEqual(after.suggestions, before.suggestions);
    assert.deepEqual(after.technicians, before.technicians);
  } finally {
    await target.close();
  }
  assert.deepEqual(
    (await snapshot(source)).reports,
    before.reports,
    "Source changed during migration.",
  );
  await assert.rejects(createBlankReport(), /Restart the service desk/);
  await assert.rejects(
    savePart({
      partNo: "P2",
      description: "Paused",
      defaultQty: "1",
      active: true,
    }),
    /Restart the service desk/,
  );
  console.log(
    `migration passed: SQLite to ${config.engine}; all data verified, source preserved, backup saved, settings saved, writes paused`,
  );
  await source.close();
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
