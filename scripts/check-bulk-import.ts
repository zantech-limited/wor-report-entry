import assert from "node:assert/strict";
import { database } from "../src/lib/storage";
import { whenReady, rememberFromLines } from "../src/lib/db";
import { blankLine } from "../src/lib/model";

async function main() {
  assert(process.env.DATA_DIR?.includes(".checks"));
  if (process.env.DB_ENGINE && process.env.DB_ENGINE !== "sqlite") {
    assert(/^desk_test_/.test(process.env.DB_NAME ?? ""));
  }
  await whenReady();
  const db = await database();
  await db.query("INSERT INTO parts (part_no, description, default_qty, active, updated_at) VALUES (?, ?, ?, ?, ?)",
    ["BATCH-0", "Curated archived description", "7", 0, "original"]);
  const lines = Array.from({ length: 450 }, (_, i) => ({
    ...blankLine(String(i + 1)),
    customer: `Batch O'Hara ? ${i}`,
    location: `Site ${i}`,
    technician: `Batch tech ${i % 10}`,
    secondaryTech: "Batch assistant",
    partNo: `BATCH-${i}`,
    description: `Imported description ${i}`,
    qty: "2",
  }));
  // The first valid occurrence wins; historical imports cannot overwrite curated parts.
  lines.push({ ...lines[1], description: "Different duplicate description" });
  const query = db.query.bind(db);
  let calls = 0;
  db.query = async (sql, values) => { calls++; return query(sql, values); };
  await db.transaction(() => rememberFromLines(lines));
  db.query = query;
  assert(calls <= 10, `Expected bounded batches, got ${calls} queries`);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM parts WHERE part_no LIKE 'BATCH-%'"))[0].n), 450);
  const original = (await db.query("SELECT * FROM parts WHERE part_no = ?", ["BATCH-0"]))[0];
  assert.equal(original.description, "Curated archived description");
  assert.equal(original.default_qty, "7");
  assert.equal(Number(original.active), 0);
  assert.equal(original.updated_at, "original");
  assert.equal((await db.query("SELECT description FROM parts WHERE part_no = ?", ["BATCH-1"]))[0].description, "Imported description 1");
  assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM suggestions WHERE kind = 'customer' AND value LIKE 'Batch %'"))[0].n), 450);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM suggestions WHERE kind = 'location' AND parent LIKE 'Batch %'"))[0].n), 450);
  await assert.rejects(() => db.transaction(async () => {
    const rows: (string | null)[][] = Array.from({ length: 401 }, (_, i) => [`batch-rollback-${i}`, "value"]);
    rows[200][1] = null;
    await db.insertRows("INSERT INTO meta (key, value)", rows, "");
  }));
  assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM meta WHERE key LIKE 'batch-rollback-%'"))[0].n), 0);
  console.log(`Batch import checks passed (${db.config.engine}): 450 parts, curated/archived preservation, duplicate handling, suggestions, rollback; ${calls} data queries.`);
  await db.close();
}
main().catch(error => { console.error(error); process.exit(1); });
