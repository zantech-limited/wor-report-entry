import { writesPaused } from "./storage";
import { logEvent } from "./events";

const restartState = globalThis as unknown as { deskRestartAt?: number };
export function storageRestartAt() {
  return restartState.deskRestartAt ?? null;
}
export function scheduleStorageRestart() {
  if (process.env.DESK_AUTO_RESTART !== "true") return null;
  if (!writesPaused()) {
    throw new Error("Storage must be verified before restarting.");
  }
  if (!restartState.deskRestartAt) {
    restartState.deskRestartAt = Date.now() + 20000;
    logEvent("storage.restart_scheduled", "Automatic restart scheduled in 20 seconds.");
    setTimeout(() => process.exit(0), 20000);
  }
  return restartState.deskRestartAt;
}
