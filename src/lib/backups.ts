import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  database,
  dataDirectory,
  assertWritable,
  pauseWrites,
  saveConfig,
  Storage,
  type Row,
  type StorageConfig,
} from "./storage";
import { whenReady } from "./db";
import { blankLine, type WorkOrder } from "./model";
import { logEvent } from "./events";

export type Backup = {
  format: "service-desk-backup";
  version: 1;
  createdAt: string;
  reports: Row[];
  suggestions: Row[];
  meta: Row[];
  parts?: Row[];
  technicians?: Row[];
};
export async function snapshot(db: Storage): Promise<Backup> {
  return db.transaction(async () => ({
    format: "service-desk-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    reports: (await db.query("SELECT * FROM reports ORDER BY id")).map(
      (row) => ({
        ...row,
        source_blob: row.source_blob
          ? Buffer.from(row.source_blob as Uint8Array).toString("base64")
          : null,
      }),
    ),
    suggestions: (
      await db.query("SELECT * FROM suggestions ORDER BY kind, parent, value")
    ).map((row) => ({ ...row })),
    meta: (await db.query("SELECT * FROM meta ORDER BY key")).map((row) => ({
      ...row,
    })),
    parts: (await db.query("SELECT * FROM parts ORDER BY part_no")).map(
      (row) => ({ ...row }),
    ),
    technicians: (
      await db.query("SELECT * FROM technicians ORDER BY name")
    ).map((row) => ({ ...row })),
  }));
}
export async function createBackup() {
  await whenReady();
  return snapshot(await database());
}

function stringField(row: Row, key: string, max = 10000000): string {
  if (typeof row[key] !== "string" || (row[key] as string).length > max)
    throw new Error(`Invalid backup field: ${key}.`);
  return row[key] as string;
}
export function validateBackup(value: unknown): Backup {
  if (!value || typeof value !== "object")
    throw new Error("Choose a service desk JSON backup.");
  const b = value as Backup;
  if (
    b.format !== "service-desk-backup" ||
    b.version !== 1 ||
    !Array.isArray(b.reports) ||
    !Array.isArray(b.suggestions) ||
    !Array.isArray(b.meta)
  )
    throw new Error("Unsupported backup format.");
  if (b.reports.length > 10000 || b.suggestions.length > 100000)
    throw new Error("This backup contains too many records.");
  for (const row of b.reports) {
    for (const key of [
      "id",
      "title",
      "prepared_by",
      "created_at",
      "updated_at",
      "prefix_map",
      "lines",
    ])
      stringField(row, key);
    if (row.source_filename !== null) stringField(row, "source_filename", 512);
    const lines: unknown = JSON.parse(stringField(row, "lines"));
    const prefixes: unknown = JSON.parse(stringField(row, "prefix_map"));
    if (!Array.isArray(lines) || !Array.isArray(prefixes))
      throw new Error("Invalid report data in backup.");
    for (const line of lines as Row[])
      for (const field of Object.keys(blankLine("1")))
        stringField(line, field, field === "id" ? 100 : 100000);
    for (const prefix of prefixes as Row[]) {
      stringField(prefix, "prefix", 32);
      stringField(prefix, "model", 255);
    }
    if (row.source_blob !== null) {
      const blob = stringField(row, "source_blob", 30 * 1024 * 1024);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(blob) || blob.length % 4)
        throw new Error("Invalid workbook data in backup.");
    }
  }
  for (const row of b.suggestions) {
    if (
      !["customer", "location", "tech"].includes(stringField(row, "kind", 32))
    )
      throw new Error("Invalid name directory in backup.");
    stringField(row, "parent", 255);
    stringField(row, "value", 255);
    if (!Number.isInteger(row.uses) || Number(row.uses) < 1)
      throw new Error("Invalid name usage in backup.");
  }
  for (const row of b.meta) {
    stringField(row, "key", 255);
    stringField(row, "value", 1000);
  }
  if (b.parts !== undefined && !Array.isArray(b.parts))
    throw new Error("Invalid parts catalog.");
  for (const row of b.parts ?? []) {
    stringField(row, "part_no", 255);
    stringField(row, "description", 2000);
    stringField(row, "default_qty", 100);
    stringField(row, "updated_at", 100);
    if (row.active !== 0 && row.active !== 1)
      throw new Error("Invalid part availability.");
  }
  if (b.technicians !== undefined && !Array.isArray(b.technicians))
    throw new Error("Invalid technician directory.");
  for (const row of b.technicians ?? []) {
    stringField(row, "name", 255);
    if (row.active !== 0 && row.active !== 1)
      throw new Error("Invalid technician availability.");
  }
  return b;
}

async function insertRows(db: Storage, backup: Backup, copyIds: boolean) {
  const reportIds=new Map<string,string>();
  for (const row of backup.reports) {
    const id=copyIds ? row.id as string : randomUUID();
    reportIds.set(row.id as string,id);
    const lines = JSON.parse(row.lines as string) as WorkOrder[];
    await db.query(
      `INSERT INTO reports (id, title, prepared_by, source_filename, created_at, updated_at, prefix_map, lines, source_blob) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        row.title as string,
        row.prepared_by as string,
        row.source_filename as string | null,
        row.created_at as string,
        row.updated_at as string,
        row.prefix_map as string,
        copyIds
          ? (row.lines as string)
          : JSON.stringify(
              lines.map((line) => ({ ...line, id: randomUUID() })),
            ),
        row.source_blob
          ? Buffer.from(row.source_blob as string, "base64")
          : null,
      ],
    );
  }
  for (const row of backup.suggestions)
    await db.query(
      `INSERT INTO suggestions (kind, parent, value, uses) VALUES (?, ?, ?, ?) ON CONFLICT(kind, parent, value) DO UPDATE SET uses = MAX(uses, excluded.uses)`,
      [
        row.kind as string,
        row.parent as string,
        row.value as string,
        Number(row.uses),
      ],
    );
  if (copyIds)
    for (const row of backup.meta)
      await db.query("INSERT INTO meta (key, value) VALUES (?, ?)", [
        row.key as string,
        row.value as string,
      ]);
  else for(const row of backup.meta) {
    let key=String(row.key);
    if(key.startsWith('report-month:')) {
      const id=reportIds.get(key.slice(13));if(!id)continue;
      key=`report-month:${id}`;
    } else if(!key.startsWith('customer-') && !key.startsWith('part-description:')) continue;
    if(!await db.prepare('SELECT key FROM meta WHERE key = ?').get(key)) await db.query('INSERT INTO meta (key, value) VALUES (?, ?)',[key,String(row.value)]);
  }
  for (const row of backup.parts ?? []) {
    if (
      !copyIds &&
      (await db
        .prepare("SELECT part_no FROM parts WHERE part_no = ?")
        .get(row.part_no as string))
    )
      continue;
    await db.query(
      "INSERT INTO parts (part_no, description, default_qty, active, updated_at) VALUES (?, ?, ?, ?, ?)",
      [
        row.part_no as string,
        row.description as string,
        row.default_qty as string,
        Number(row.active),
        row.updated_at as string,
      ],
    );
  }
  for (const row of backup.technicians ?? []) {
    if (
      !copyIds &&
      (await db
        .prepare("SELECT name FROM technicians WHERE name = ?")
        .get(row.name as string))
    )
      continue;
    await db.query("INSERT INTO technicians (name, active) VALUES (?, ?)", [
      row.name as string,
      Number(row.active),
    ]);
  }
}

export async function restoreBackup(value: unknown) {
  const backup = validateBackup(value);
  await whenReady();
  const db = await database();
  await db.transaction(async () => {
    assertWritable();
    await insertRows(db, backup, false);
  });
  logEvent(
    "backup.restored",
    `Restored ${backup.reports.length} months as new copies.`,
  );
  return backup.reports.length;
}

function digest(backup: Backup) {
  // Locale-independent order keeps comparisons identical across database collations.
  const sorted = (rows: Row[], fields: string[]) =>
    rows
      .map((row) => fields.map((field) => row[field]))
      .sort((a, b) =>
        JSON.stringify(a) < JSON.stringify(b)
          ? -1
          : JSON.stringify(a) > JSON.stringify(b)
            ? 1
            : 0,
      );
  return createHash("sha256")
    .update(
      JSON.stringify({
        reports: sorted(backup.reports, [
          "id",
          "title",
          "prepared_by",
          "source_filename",
          "created_at",
          "updated_at",
          "prefix_map",
          "lines",
          "source_blob",
        ]),
        suggestions: sorted(backup.suggestions, [
          "kind",
          "parent",
          "value",
          "uses",
        ]),
        meta: sorted(backup.meta, ["key", "value"]),
        parts: sorted(backup.parts ?? [], [
          "part_no",
          "description",
          "default_qty",
          "active",
          "updated_at",
        ]),
        technicians: sorted(backup.technicians ?? [], ["name", "active"]),
      }),
    )
    .digest("hex");
}

export async function migrateStorage(config: StorageConfig) {
  await whenReady();
  const source = await database();
  if (config.engine === "sqlite")
    throw new Error(
      "To return to SQLite, restart with DB_ENGINE=sqlite and restore a downloaded backup. Migration destinations must be MySQL or PostgreSQL.",
    );
  const target = new Storage(config);
  try {
    await target.initialize();
    return await source.transaction(async () => {
      assertWritable();
      const backup = await snapshot(source);
      const folder = path.join(dataDirectory, "backups");
      mkdirSync(folder, { recursive: true });
      const filename = `before-migration-${Date.now()}.json`;
      writeFileSync(path.join(folder, filename), JSON.stringify(backup), {
        mode: 0o600,
      });
      await target.transaction(async () => {
        for (const table of [
          "reports",
          "suggestions",
          "meta",
          "parts",
          "technicians",
        ]) {
          const [row] = await target.query(
            `SELECT COUNT(*) AS count FROM ${table}`,
          );
          if (Number(row.count) !== 0)
            throw new Error(
              "The destination must be empty. Existing destination data will not be overwritten.",
            );
        }
        await insertRows(target, backup, true);
        if (digest(await snapshot(target)) !== digest(backup))
          throw new Error(
            "Migration verification failed; destination changes were rolled back.",
          );
      });
      saveConfig(config);
      pauseWrites();
      logEvent(
        "storage.migrated",
        `Verified ${backup.reports.length} months in ${config.engine}. Source retained; writes paused until restart.`,
      );
      return { reports: backup.reports.length, backupFile: filename };
    });
  } finally {
    await target.close();
  }
}
