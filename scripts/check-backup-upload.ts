import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { uploadBackupFile } from "../src/lib/backup-upload-client";
import {
  acceptBackupChunk,
  finishBackupUpload,
} from "../src/lib/backup-upload";
import { readJsonResponse } from "../src/lib/response-json";
import { database } from "../src/lib/storage";
import { blankLine } from "../src/lib/model";
async function main() {
  assert(process.env.DATA_DIR?.includes(".checks"));
  await assert.rejects(
    () =>
      readJsonResponse(
        new Response("Request Entity Too Large", { status: 413 }),
      ),
    /upload.*too large/i,
  );
  const value = process.env.LEGACY_BACKUP_FILE
    ? readFileSync(process.env.LEGACY_BACKUP_FILE)
    : Buffer.from(
        JSON.stringify({
          format: "service-desk-backup",
          version: 1,
          createdAt: new Date().toISOString(),
          reports: [
            {
              id: randomUUID(),
              title: "Legacy backup",
              prepared_by: "Synthetic Tech",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              prefix_map: "[]",
              lines: JSON.stringify([
                { ...blankLine("1"), customer: "Legacy customer" },
              ]),
              source_filename: "old.xlsm",
              source_blob: Buffer.alloc(5 * 1024 * 1024, 73).toString("base64"),
            },
          ],
          suggestions: [],
          meta: [],
        }),
      );
  const source = JSON.parse(value.toString());
  const file = new File([value], "legacy-backup.json");
  let calls = 0,
    upload = "";
  const send = async (form: FormData) => {
    calls++;
    assert(
      (form.get("file") as File)?.size <= 1024 * 1024 || !form.has("file"),
    );
    upload = String(form.get("uploadId"));
    if (form.get("mode") === "chunk") {
      const part = form.get("file") as File;
      return acceptBackupChunk("test-admin", {
        id: upload,
        index: Number(form.get("index")),
        size: Number(form.get("size")),
        bytes: Buffer.from(await part.arrayBuffer()),
      });
    }
    return { count: await finishBackupUpload("test-admin", upload) };
  };
  const result = await uploadBackupFile(file, send);
  assert.equal(result.count, source.reports.length);
  assert(calls > 2);
  assert.equal(
    await finishBackupUpload("test-admin", upload),
    source.reports.length,
  );
  await assert.rejects(() => finishBackupUpload("other-admin", upload));
  const db = await database();
  const reports = await db.query("SELECT * FROM reports");
  assert.equal(reports.length, source.reports.length);
  const fingerprint = (row: Record<string, unknown>) =>
    createHash("sha256")
      .update(
        JSON.stringify({
          title: row.title,
          prepared_by: row.prepared_by,
          prefix_map: row.prefix_map,
          source_filename: row.source_filename,
          source_blob:
            typeof row.source_blob === "string"
              ? row.source_blob
              : row.source_blob
                ? Buffer.from(row.source_blob as Uint8Array).toString("base64")
                : null,
          lines: JSON.parse(String(row.lines)).map(
            (line: Record<string, unknown>) =>
              Object.fromEntries(
                Object.entries(line).filter(([key]) => key !== "id"),
              ),
          ),
        }),
      )
      .digest("hex");
  assert.deepEqual(
    reports.map(fingerprint).sort(),
    source.reports.map(fingerprint).sort(),
    "Restored work-order contents and workbook bytes must match every source workbook.",
  );
  const failureId = randomUUID();
  const small = Buffer.from(
    JSON.stringify({
      ...source,
      reports: [source.reports[0], source.reports[0]].map(
        (row: Record<string, unknown>) => ({ ...row, source_blob: null }),
      ),
      suggestions: [],
      meta: [],
      parts: [],
      technicians: [],
    }),
  );
  for (let index = 0; index < Math.ceil(small.length / (1024 * 1024)); index++)
    await acceptBackupChunk("test-admin", {
      id: failureId,
      index,
      size: small.length,
      bytes: small.subarray(index * 1024 * 1024, (index + 1) * 1024 * 1024),
    });
  const originalQuery = db.query.bind(db);
  let inserted = 0;
  db.query = async (sql, values = []) => {
    if (sql.startsWith("INSERT INTO reports") && ++inserted === 2)
      throw new Error("Synthetic database interruption");
    return originalQuery(sql, values);
  };
  try {
    await assert.rejects(
      () => finishBackupUpload("test-admin", failureId),
      /Synthetic database interruption/,
    );
  } finally {
    db.query = originalQuery;
  }
  assert.equal(
    (await db.query("SELECT id FROM reports")).length,
    source.reports.length,
    "Failed finalization must roll back every inserted workbook.",
  );
  const { snapshot } = await import("../src/lib/backups");
  const portable = await snapshot(db);
  assert(
    !portable.workflow?.some((row) =>
      ["backup-upload", "backup-chunk"].includes(String(row.kind)),
    ),
    "Temporary uploads must not enter portable backups.",
  );
  console.log(
    `Chunked legacy restore passed: ${value.length} bytes, ${source.reports.length} workbooks, unchanged lines/macros, duplicate finalization and owner isolation.`,
  );
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
