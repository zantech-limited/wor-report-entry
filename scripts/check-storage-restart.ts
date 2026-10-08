import assert from "node:assert/strict";
import { scheduleStorageRestart, storageRestartAt } from "../src/lib/storage-restart";

assert(process.env.DATA_DIR?.includes(".checks"));
const globals = globalThis as unknown as { deskWritesPaused?: boolean; deskRestartAt?: number };
const originalTimeout = globalThis.setTimeout;
const originalFlag = process.env.DESK_AUTO_RESTART;
let scheduled = 0;
try {
  globalThis.setTimeout = ((callback: unknown, milliseconds: number) => {
    assert.equal(typeof callback, "function");
    assert.equal(milliseconds, 20000);
    scheduled++;
    return {};
  }) as unknown as typeof setTimeout;
  delete process.env.DESK_AUTO_RESTART;
  assert.equal(scheduleStorageRestart(), null);
  process.env.DESK_AUTO_RESTART = "true";
  globals.deskWritesPaused = false;
  assert.throws(scheduleStorageRestart, /verified/);
  assert.equal(scheduled, 0);
  globals.deskWritesPaused = true;
  const before = Date.now();
  const restart = scheduleStorageRestart();
  assert(restart && restart >= before + 20000 && restart <= Date.now() + 20000);
  assert.equal(storageRestartAt(), restart);
  assert.equal(scheduleStorageRestart(), restart);
  assert.equal(scheduled, 1);
  console.log("Restart opt-in, verified-storage guard, 20-second deadline and single scheduling passed.");
} finally {
  globalThis.setTimeout = originalTimeout;
  if (originalFlag === undefined) delete process.env.DESK_AUTO_RESTART;
  else process.env.DESK_AUTO_RESTART = originalFlag;
  delete globals.deskWritesPaused;
  delete globals.deskRestartAt;
}
