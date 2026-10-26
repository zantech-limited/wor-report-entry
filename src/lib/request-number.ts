import { database } from "./storage";

/** Minimum digits. Longer sequences stay unique without renumbering older orders. */
export const WORK_ORDER_NUMBER_WIDTH = 5;
export const WORK_ORDER_NUMBER_PREFIX = "OWOR";

const counterKey = "request-number:owor";
const scannedKey = "request-number:owor-scanned";

function issuedNumber(wor: unknown) {
  const match = new RegExp(`^${WORK_ORDER_NUMBER_PREFIX}(\\d+)$`).exec(
    String(wor ?? "").trim(),
  );
  const value = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Pad to the current width. Values past that width keep every digit. */
export function formatWorkOrderNumber(sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error("Invalid request number counter.");
  return (
    WORK_ORDER_NUMBER_PREFIX +
    String(sequence).padStart(WORK_ORDER_NUMBER_WIDTH, "0")
  );
}

/** Highest OWOR sequence already stored. Earlier formats, including WRETO, are left alone. */
async function highestIssued(db: Awaited<ReturnType<typeof database>>) {
  let last = 0;
  const consider = (wor: unknown) => {
    const value = issuedNumber(wor);
    if (value) last = Math.max(last, value);
  };
  for (const report of await db.query("SELECT lines FROM reports")) {
    try {
      for (const line of JSON.parse(String(report.lines))) consider(line?.wor);
    } catch {
      /* A damaged workbook row must not block the next number. */
    }
  }
  for (const row of await db.query(
    "SELECT data FROM desk_records WHERE kind = ?",
    ["job"],
  )) {
    try {
      consider(JSON.parse(String(row.data))?.line?.wor);
    } catch {
      /* Ignore a damaged job record. */
    }
  }
  return last;
}

async function lockedCounter(db: Awaited<ReturnType<typeof database>>) {
  await db.query(
    "INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING",
    [counterKey, "0"],
  );
  const row = await db
    .prepare(
      "SELECT value FROM meta WHERE key = ?" +
        (db.config.engine === "sqlite" ? "" : " FOR UPDATE"),
    )
    .get(counterKey);
  const last = Number(row?.value);
  if (!Number.isSafeInteger(last) || last < 0)
    throw new Error("Invalid request number counter.");
  return last;
}

/** Call inside the job transaction; locking this durable counter serializes allocation. */
export async function nextRequestNumber() {
  const db = await database();
  let last = await lockedCounter(db);
  const scanned = await db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get(scannedKey);
  if (!scanned) {
    last = Math.max(last, await highestIssued(db));
    await db.query(
      "INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING",
      [scannedKey, "1"],
    );
    await db.query("UPDATE meta SET value = ? WHERE key = ?", ["1", scannedKey]);
  }
  const next = last + 1;
  if (!Number.isSafeInteger(next))
    throw new Error("Invalid request number counter.");
  await db.query("UPDATE meta SET value = ? WHERE key = ?", [
    String(next),
    counterKey,
  ]);
  return formatWorkOrderNumber(next);
}

/** Keep a stored OWOR number from being issued again. Other formats are ignored. */
export async function noteRequestNumber(wor: string) {
  const issued = issuedNumber(wor);
  if (!issued) return;
  const db = await database();
  await db.transaction(async () => {
    const last = await lockedCounter(db);
    if (issued > last)
      await db.query("UPDATE meta SET value = ? WHERE key = ?", [
        String(issued),
        counterKey,
      ]);
  });
}

export async function requestNumberTaken(wor: string, jobId: string) {
  const key = wor.trim().toLowerCase();
  if (!key) return false;
  const db = await database();
  for (const report of await db.query("SELECT lines FROM reports")) {
    let lines: { id?: string; wor?: string }[] = [];
    try {
      lines = JSON.parse(String(report.lines));
    } catch {
      continue;
    }
    if (
      lines.some(
        (line) =>
          line?.id !== jobId &&
          String(line?.wor ?? "").trim().toLowerCase() === key,
      )
    )
      return true;
  }
  return false;
}
