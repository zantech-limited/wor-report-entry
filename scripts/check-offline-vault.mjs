import assert from "node:assert/strict";
import "fake-indexeddb/auto";
Object.defineProperty(globalThis, "navigator", {
  value: { storage: { persist: async () => true } },
  configurable: true,
});
const {
  unlockVault,
  vaultPut,
  vaultGet,
  vaultDrafts,
  acknowledgeDraft,
  importRecovery,
} = await import("../src/lib/offline-vault.ts");
const context = "test-db:tech-a",
  key = await unlockVault(context, "device-test-passphrase"),
  job = { line: { id: "job-1", customer: "First" }, fields: {} };
const draft = {
  id: "job-1",
  job,
  revision: 1,
  operationId: "operation-a",
  submit: false,
  updatedAt: "2026-10-22",
};
await vaultPut(context, key, "draft:job-1", draft);
const edited = {
  ...draft,
  operationId: "operation-b",
  job: { ...job, line: { ...job.line, customer: "Newer unsent edit" } },
};
await vaultPut(context, key, "draft:job-1", edited);
const preserved = await acknowledgeDraft(
  context,
  key,
  "job-1",
  "operation-a",
  2,
  "WRETO-16719",
);
assert.equal(preserved.job.line.customer, "Newer unsent edit");
assert.equal(preserved.revision, 2);
assert.equal(preserved.job.line.wor,"WRETO-16719");
assert.equal((await vaultDrafts(context, key)).length, 1);
assert.equal(await vaultGet("other-db:tech-a", key, "draft:job-1"), undefined);
await assert.rejects(unlockVault(context, "incorrect-passphrase"));
await acknowledgeDraft(context, key, "job-1", "operation-b", 3);
assert.equal((await vaultDrafts(context, key)).length, 0);
await vaultPut(context, key, "draft:job-1", draft);
const db = await new Promise((resolve, reject) => {
  const r = indexedDB.open("zantech-field-v1");
  r.onsuccess = () => resolve(r.result);
  r.onerror = reject;
});
const values = await new Promise((resolve, reject) => {
  const tx = db.transaction("values"),
    store = tx.objectStore("values"),
    request = store.openCursor(),
    list = [];
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      list.push([cursor.key, cursor.value]);
      cursor.continue();
    } else resolve(list);
  };
  request.onerror = reject;
});
const recovery = new File(
  [
    JSON.stringify({
      format: "zantech-encrypted-device-recovery",
      context,
      values,
    }),
  ],
  "recovery.json",
  { type: "application/json" },
);
await vaultPut(context, key, "draft:job-1", edited);
assert.equal(
  await importRecovery(context, key, recovery, "device-test-passphrase"),
  1,
);
assert.equal((await vaultDrafts(context, key))[0].operationId, "operation-a");
console.log(
  "Offline vault passed: encryption, account/database partitioning, upload/edit acknowledgement race, matching acknowledgements, recovery import and archive preservation.",
);
process.exit(0);
