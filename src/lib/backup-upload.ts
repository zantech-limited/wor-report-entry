import { database, assertWritable } from "./storage";
import { record, insertRecord, updateRecord } from "./records";
import { restoreBackup } from "./backups";
import { whenReady } from "./db";
import { BACKUP_CHUNK_BYTES, BACKUP_MAX_BYTES } from "./backup-upload-limits";
type Upload = {
  size: number;
  received: number;
  expires: string;
  count?: number;
};
const manifestId = (id: string) => `backup-upload:${id}`;
function checkId(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new Error("Invalid backup upload identifier.");
}
async function cleanup() {
  const db = await database();
  const expired = await db.query(
    "SELECT id FROM desk_records WHERE kind = ? AND updated_at < ?",
    ["backup-upload", new Date(Date.now() - 3600000).toISOString()],
  );
  for (const row of expired) {
    const id = String(row.id).slice("backup-upload:".length);
    await db.query("DELETE FROM desk_records WHERE kind = ? AND owner_id = ?", [
      "backup-chunk",
      id,
    ]);
    await db.query("DELETE FROM desk_records WHERE id = ?", [String(row.id)]);
  }
}
export async function acceptBackupChunk(
  owner: string,
  input: { id: string; index: number; size: number; bytes: Buffer },
) {
  checkId(input.id);
  const { id, index, size, bytes } = input;
  if (
    !Number.isInteger(size) ||
    size < 1 ||
    size > BACKUP_MAX_BYTES ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= Math.ceil(size / BACKUP_CHUNK_BYTES) ||
    bytes.length !==
      Math.min(BACKUP_CHUNK_BYTES, size - index * BACKUP_CHUNK_BYTES)
  )
    throw new Error("Invalid backup upload chunk.");
  assertWritable();
  if (index === 0) await cleanup();
  const db = await database();
  return db.transaction(async () => {
    const previous = await record<Upload>(manifestId(id), true);
    if (
      previous &&
      (previous.kind !== "backup-upload" ||
        previous.ownerId !== owner ||
        previous.data.size !== size ||
        previous.data.expires < new Date().toISOString() ||
        previous.data.count !== undefined)
    )
      throw new Error("Invalid or expired backup upload.");
    if (!previous && index !== 0)
      throw new Error("Invalid backup upload sequence. Select the file again.");
    const upload =
      previous ||
      (await insertRecord(
        "backup-upload",
        owner,
        {
          size,
          received: 0,
          expires: new Date(Date.now() + 3600000).toISOString(),
        },
        manifestId(id),
      ));
    const chunkId = `backup-chunk:${id}:${index}`;
    if (index < upload.data.received) {
      const existing = await record<{ value: string }>(chunkId);
      if (existing?.data.value !== bytes.toString("base64"))
        throw new Error("Invalid repeated backup upload chunk.");
      return { received: upload.data.received };
    }
    if (index !== upload.data.received)
      throw new Error("Invalid backup upload sequence.");
    await insertRecord(
      "backup-chunk",
      id,
      { index, value: bytes.toString("base64") },
      chunkId,
    );
    await updateRecord(upload, { ...upload.data, received: index + 1 });
    return { received: index + 1 };
  });
}
export async function finishBackupUpload(owner: string, id: string) {
  checkId(id);
  assertWritable();
  await whenReady();
  const db = await database();
  return db.transaction(async () => {
    const upload = await record<Upload>(manifestId(id), true);
    if (
      !upload ||
      upload.kind !== "backup-upload" ||
      upload.ownerId !== owner ||
      upload.data.expires < new Date().toISOString()
    )
      throw new Error(
        "Invalid or expired backup upload. Select the file again.",
      );
    if (upload.data.count !== undefined) return upload.data.count;
    if (
      upload.data.received !== Math.ceil(upload.data.size / BACKUP_CHUNK_BYTES)
    )
      throw new Error("Invalid incomplete backup upload.");
    const rows = await db.query(
      "SELECT data FROM desk_records WHERE kind = ? AND owner_id = ?",
      ["backup-chunk", id],
    );
    const chunks = rows
      .map(
        (row) =>
          JSON.parse(String(row.data)) as { index: number; value: string },
      )
      .sort((a, b) => a.index - b.index);
    const bytes = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk.value, "base64")),
    );
    if (bytes.length !== upload.data.size)
      throw new Error("Invalid incomplete backup upload.");
    let backup;
    try {
      backup = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
    } catch {
      throw new Error("Choose a valid JSON backup.");
    }
    const count = await restoreBackup(backup);
    await updateRecord(upload, { ...upload.data, count });
    await db.query("DELETE FROM desk_records WHERE kind = ? AND owner_id = ?", [
      "backup-chunk",
      id,
    ]);
    return count;
  });
}
