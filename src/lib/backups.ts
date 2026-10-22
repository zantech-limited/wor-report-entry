import { protectAccountTables } from "./account-schema";
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
import { getMigrations } from "better-auth/db/migration";
import { makeAuth } from "./accounts";
const accountTables = [
  "desk_user",
  "desk_account",
  "desk_verification",
] as const;

export type Backup = {
  format: "service-desk-backup";
  version: 1;
  createdAt: string;
  reports: Row[];
  suggestions: Row[];
  meta: Row[];
  parts?: Row[];
  technicians?: Row[];
  workflow?: Row[];
  accounts?: Partial<Record<(typeof accountTables)[number], Row[]>>;
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
    workflow: await db.query(
      "SELECT * FROM desk_records WHERE kind NOT IN ('backup-upload','backup-chunk') ORDER BY id",
    ),
    accounts: await accountSnapshot(db),
  }));
}
const authDateFields = new Set([
  "createdAt",
  "updatedAt",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
  "expiresAt",
]);
async function accountSnapshot(db: Storage) {
  if (
    !(await db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("accounts-ready"))
  )
    return undefined;
  const result: Partial<Record<(typeof accountTables)[number], Row[]>> = {};
  for (const table of accountTables)
    result[table] = (await db.query(`SELECT * FROM ${table} ORDER BY id`)).map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            value === null
              ? null
              : authDateFields.has(key)
                ? new Date(
                    value instanceof Date
                      ? value
                      : typeof value === "number"
                        ? value
                        : String(value),
                  ).toISOString()
                : key === "emailVerified"
                  ? value === true || value === 1 || value === "true"
                  : value,
          ]),
        ),
    );
  return result;
}
export async function restoreFullSystem(backupValue: unknown) {
  const backup = validateBackup(backupValue),
    db = await database();
  await prepareAccountRestore(db, backup);
  await db.transaction(async () => {
    for (const table of [
      "reports",
      "suggestions",
      "parts",
      "technicians",
      "desk_records",
    ]) {
      const rows = await db.query(`SELECT COUNT(*) AS count FROM ${table}`);
      if (Number(rows[0].count) !== 0)
        throw new Error("The full-system restore destination must be empty.");
    }
    const metadata = await db.query("SELECT key FROM meta");
    if (metadata.some((row) => row.key !== "database-identifier"))
      throw new Error("The full-system restore destination must be empty.");
    await db.query("DELETE FROM meta WHERE key = ?", ["database-identifier"]);
    await insertRows(db, backup, true);
  });
  return backup.reports.length;
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
  if (
    b.workflow !== undefined &&
    (!Array.isArray(b.workflow) || b.workflow.length > 200000)
  )
    throw new Error("Invalid workflow backup.");
  for (const row of b.workflow ?? []) {
    for (const field of ["id", "kind", "owner_id", "data", "updated_at"])
      stringField(row, field, field === "data" ? 10000000 : 255);
    if (!Number.isInteger(row.revision) || Number(row.revision) < 1)
      throw new Error("Invalid workflow revision.");
    JSON.parse(String(row.data));
  }
  if (b.accounts !== undefined) {
    if (
      !b.accounts ||
      typeof b.accounts !== "object" ||
      Object.keys(b.accounts).some(
        (table) =>
          !accountTables.includes(table as (typeof accountTables)[number]),
      )
    )
      throw new Error("Invalid account backup.");
    for (const table of accountTables) {
      const rows = b.accounts[table];
      if (rows !== undefined && (!Array.isArray(rows) || rows.length > 100000))
        throw new Error("Invalid account records.");
      for (const row of rows ?? []) {
        stringField(row, "id", 255);
        if (
          Object.values(row).some(
            (value) =>
              value !== null &&
              !["string", "number", "boolean"].includes(typeof value),
          )
        )
          throw new Error("Invalid account fields.");
      }
    }
  }
  return b;
}

async function prepareAccountRestore(db: Storage, backup: Backup) {
  if (!backup.accounts) return;
  // Better Auth uses its own connection; run DDL before acquiring a write lock.
  await (await getMigrations(makeAuth(db.config).options)).runMigrations();
  await protectAccountTables(db);
  for (const table of accountTables) {
    const [row] = await db.query(`SELECT COUNT(*) AS count FROM ${table}`);
    if (Number(row.count))
      throw new Error(
        "The destination accounts must be empty. Existing accounts will not be overwritten.",
      );
  }
}
async function insertRows(db: Storage, backup: Backup, copyIds: boolean) {
  const reportIds = new Map<string, string>();
  for (const row of backup.reports) {
    const id = copyIds ? (row.id as string) : randomUUID();
    reportIds.set(row.id as string, id);
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
  const suggestions = new Map<string, Row>();
  for (const row of backup.suggestions) {
    const key = JSON.stringify([row.kind, row.parent, row.value]);
    const previous = suggestions.get(key);
    if (!previous || Number(row.uses) > Number(previous.uses))
      suggestions.set(key, row);
  }
  await db.insertRows(
    "INSERT INTO suggestions (kind, parent, value, uses)",
    [...suggestions.values()].map((row) => [
      String(row.kind),
      String(row.parent),
      String(row.value),
      Number(row.uses),
    ]),
    "ON CONFLICT(kind, parent, value) DO UPDATE SET uses = MAX(uses, excluded.uses)",
  );
  if (copyIds)
    for (const row of backup.meta)
      await db.query("INSERT INTO meta (key, value) VALUES (?, ?)", [
        row.key as string,
        row.value as string,
      ]);
  else
    for (const row of backup.meta) {
      let key = String(row.key);
      if (key.startsWith("report-month:")) {
        const id = reportIds.get(key.slice(13));
        if (!id) continue;
        key = `report-month:${id}`;
      } else if (
        !key.startsWith("customer-") &&
        !key.startsWith("part-description:")
      )
        continue;
      if (!(await db.prepare("SELECT key FROM meta WHERE key = ?").get(key)))
        await db.query("INSERT INTO meta (key, value) VALUES (?, ?)", [
          key,
          String(row.value),
        ]);
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
  if (copyIds) {
    if (backup.accounts) {
      for (const table of accountTables)
        for (const row of backup.accounts[table] ?? []) {
          const columns = Object.keys(row);
          if (columns.some((column) => !/^\w+$/.test(column)))
            throw new Error("Invalid account columns.");
          const quoted = columns.map((column) =>
            db.config.engine === "mysql" ? `\`${column}\`` : `"${column}"`,
          );
          const dates = new Set([
            "createdAt",
            "updatedAt",
            "accessTokenExpiresAt",
            "refreshTokenExpiresAt",
            "expiresAt",
          ]);
          const values = columns.map((column) => {
            const value = row[column];
            if (dates.has(column) && value !== null) {
              const timestamp =
                typeof value === "number" ? value : Date.parse(String(value));
              if (!Number.isFinite(timestamp))
                throw new Error("Invalid account date.");
              return db.config.engine === "sqlite"
                ? timestamp
                : db.config.engine === "mysql"
                  ? new Date(timestamp)
                      .toISOString()
                      .slice(0, 23)
                      .replace("T", " ")
                  : new Date(timestamp).toISOString();
            }
            if (typeof value === "boolean")
              return db.config.engine === "sqlite" ||
                db.config.engine === "mysql"
                ? Number(value)
                : String(value);
            return value as string | number | null;
          });
          await db.query(
            `INSERT INTO ${table} (${quoted.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
            values,
          );
        }
    }
    for (const row of backup.workflow ?? [])
      await db.query(
        "INSERT INTO desk_records (id,kind,owner_id,revision,data,updated_at) VALUES (?,?,?,?,?,?)",
        [
          String(row.id),
          String(row.kind),
          String(row.owner_id),
          Number(row.revision),
          String(row.data),
          String(row.updated_at),
        ],
      );
  }
}

export async function restoreBackup(value: unknown) {
  const backup = validateBackup(value);
  if (
    backup.accounts ||
    backup.workflow?.some(
      (row) => !["report-history"].includes(String(row.kind)),
    )
  )
    throw new Error(
      "This backup includes accounts or signed workflow history. Restore it into an empty database using the full-system restore command; importing copies would break identities.",
    );
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
        workflow: sorted(backup.workflow ?? [], [
          "id",
          "kind",
          "owner_id",
          "revision",
          "data",
          "updated_at",
        ]),
        accounts: backup.accounts
          ? Object.fromEntries(
              accountTables.map((table) => [
                table,
                sorted(
                  backup.accounts?.[table] ?? [],
                  [
                    ...new Set(
                      (backup.accounts?.[table] ?? []).flatMap((row) =>
                        Object.keys(row),
                      ),
                    ),
                  ].sort(),
                ),
              ]),
            )
          : undefined,
      }),
    )
    .digest("hex");
}

export async function migrateStorage(config: StorageConfig) {
  await whenReady();
  const source = await database();
  const sourceCode = await (
    await import("./database-identity")
  ).databaseIdentifier(source);
  if (config.databaseCode && config.databaseCode !== sourceCode)
    throw new Error(
      "Database identifier must match the current database when copying data.",
    );
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
      await prepareAccountRestore(target, backup);
      await target.transaction(async () => {
        for (const table of [
          "reports",
          "suggestions",
          "meta",
          "parts",
          "technicians",
          "desk_records",
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
      saveConfig({ ...config, databaseCode: sourceCode });
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
