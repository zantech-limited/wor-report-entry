import { database } from "./storage";

/** Call inside the job transaction; locking this durable counter serializes allocation. */
export async function nextRequestNumber() {
  const db = await database();
  const key = "request-number:wreto";
  await db.query(
    "INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING",
    [key, "16718"],
  );
  const row = await db
    .prepare(
      "SELECT value FROM meta WHERE key = ?" +
        (db.config.engine === "sqlite" ? "" : " FOR UPDATE"),
    )
    .get(key);
  let last = Number(row.value);
  if (last === 16718) {
    const reports = await db.query("SELECT lines FROM reports");
    for (const report of reports)
      for (const line of JSON.parse(String(report.lines))) {
        const match = /^WRETO-(\d+)$/.exec(String(line.wor));
        if (match) last = Math.max(last, Number(match[1]));
      }
  }
  const next = last + 1;
  if (!Number.isSafeInteger(next))
    throw new Error("Invalid request number counter.");
  await db.query("UPDATE meta SET value = ? WHERE key = ?", [
    String(next),
    key,
  ]);
  return `WRETO-${next}`;
}
