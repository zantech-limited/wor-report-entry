import assert from "node:assert/strict";
import { database } from "../src/lib/storage";

async function main() {
  assert(process.env.DATA_DIR?.includes(".checks"));
  assert(/^desk_test_/.test(process.env.DB_NAME ?? ""));
  const db = await database();
  assert(db.config.engine !== "sqlite");
  let began!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const transaction = db.transaction(async () => {
    await db.query("INSERT INTO meta (key, value) VALUES (?, ?)", ["pooled-read-test", "uncommitted"]);
    assert.equal((await db.query("SELECT value FROM meta WHERE key = ?", ["pooled-read-test"]))[0].value, "uncommitted");
    began();
    await gate;
    throw new Error("Intentional pooled-read rollback");
  });
  const rejected = assert.rejects(transaction, /Intentional pooled-read rollback/);
  await started;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outside = await Promise.race([
      db.query("SELECT value FROM meta WHERE key = ?", ["pooled-read-test"]),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Read blocked behind transaction")), 3000); }),
    ]);
    assert.equal(outside.length, 0, "A separate pooled read saw uncommitted work");
  } finally {
    if (timer) clearTimeout(timer);
    release();
    await rejected;
  }
  assert.equal((await db.query("SELECT value FROM meta WHERE key = ?", ["pooled-read-test"])).length, 0);
  console.log("Pooled read checks passed: reads proceed during a write transaction, see only committed data, and rollback preserves isolation.");
  await db.close();
}
main().catch(error => { console.error(error); process.exit(1); });
