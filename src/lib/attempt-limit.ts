import { database } from "./storage";

const memory = new Map<string, { count: number; until: number }>();

function memoryAllow(bucket: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = memory.get(bucket);
  if (!entry || entry.until < now) {
    memory.set(bucket, { count: 1, until: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/** Drop the process-local counter. The shared database window remains. */
export function forgetAttemptMemory() {
  memory.clear();
}

export async function resetAttemptBuckets(buckets: string[]) {
  for (const bucket of buckets) memory.delete(bucket);
  const db = await database();
  for (const bucket of buckets)
    await db.query("DELETE FROM meta WHERE key = ?", [`attempt:${bucket}`]);
}

/**
 * Shared attempt window for admin-token and diagnostics checks.
 * An in-memory map resets on every serverless isolate, so the count is also
 * stored in meta and locked per database. On Vercel a database failure
 * rejects the attempt; a single long-running process keeps the memory count.
 */
export async function allowAttempt(bucket: string, limit: number, windowMs = 60_000) {
  if (!/^[a-z0-9:-]{1,64}$/.test(bucket) || limit < 1) return false;
  if (!memoryAllow(bucket, limit, windowMs)) return false;
  try {
    const db = await database();
    const key = `attempt:${bucket}`;
    return await db.transaction(async () => {
      const now = Date.now();
      const lock = db.config.engine === "sqlite" ? "" : " FOR UPDATE";
      const row = await db
        .prepare(`SELECT value FROM meta WHERE key = ?${lock}`)
        .get(key);
      let count = 1;
      let until = now + windowMs;
      if (row && "value" in row) {
        try {
          const parsed = JSON.parse(String(row.value)) as {
            count?: unknown;
            until?: unknown;
          };
          if (
            typeof parsed.until === "number" &&
            parsed.until > now &&
            typeof parsed.count === "number" &&
            Number.isFinite(parsed.count)
          ) {
            count = parsed.count + 1;
            until = parsed.until;
          }
        } catch {
          /* A damaged counter starts a new window. */
        }
      }
      const value = JSON.stringify({ count, until });
      if (row)
        await db.query("UPDATE meta SET value = ? WHERE key = ?", [value, key]);
      else
        await db.query("INSERT INTO meta (key,value) VALUES (?,?)", [key, value]);
      return count <= limit;
    });
  } catch {
    return !process.env.VERCEL;
  }
}
