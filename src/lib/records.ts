import { randomUUID } from "node:crypto";
import { database, type Row, type Storage } from "./storage";
export type DeskRecord<T = Record<string, unknown>> = {
  id: string;
  kind: string;
  ownerId: string;
  revision: number;
  data: T;
  updatedAt: string;
};
function mapRecord<T>(row: Row): DeskRecord<T> {
  return {
    id: String(row.id),
    kind: String(row.kind),
    ownerId: String(row.owner_id),
    revision: Number(row.revision),
    data: JSON.parse(String(row.data)),
    updatedAt: String(row.updated_at),
  };
}
export async function records<T>(
  kind: string,
  ownerId?: string,
): Promise<DeskRecord<T>[]> {
  const db = await database();
  const rows = await db.query(
    "SELECT * FROM desk_records WHERE kind = ?" +
      (ownerId ? " AND owner_id = ?" : "") +
      " ORDER BY updated_at DESC",
    ownerId ? [kind, ownerId] : [kind],
  );
  return rows.map((row) => mapRecord<T>(row));
}
/** Match a top-level JSON field without loading every record of that kind. */
export async function recordsWhere<T>(
  kind: string,
  field: "jobId" | "state",
  expected: string[],
): Promise<DeskRecord<T>[]> {
  const values = [...new Set(expected.filter((value) => value.length > 0 && value.length <= 80))];
  if (!values.length) return [];
  const db = await database();
  const expression =
    db.config.engine === "mysql"
      ? `JSON_UNQUOTE(JSON_EXTRACT(data, '$.${field}'))`
      : db.config.engine === "sqlite"
        ? `json_extract(data, '$.${field}')`
        : `(data::json->>'${field}')`;
  const placeholders = values.map(() => "?").join(", ");
  try {
    const rows = await db.query(
      `SELECT * FROM desk_records WHERE kind = ? AND ${expression} IN (${placeholders}) ORDER BY updated_at DESC`,
      [kind, ...values],
    );
    return rows.map((row) => mapRecord<T>(row));
  } catch {
    const all = await records<T>(kind);
    return all.filter((row) =>
      values.includes(String((row.data as { [key: string]: unknown })[field] ?? "")),
    );
  }
}
export async function record<T>(
  id: string,
  lock = false,
): Promise<DeskRecord<T> | null> {
  const db = await database();
  const row = await db
    .prepare(
      "SELECT * FROM desk_records WHERE id = ?" +
        (lock && db.config.engine !== "sqlite" ? " FOR UPDATE" : ""),
    )
    .get(id);
  return row
    ? {
        id: String(row.id),
        kind: String(row.kind),
        ownerId: String(row.owner_id),
        revision: Number(row.revision),
        data: JSON.parse(String(row.data)),
        updatedAt: String(row.updated_at),
      }
    : null;
}
export async function insertRecord<T>(
  kind: string,
  ownerId: string,
  data: T,
  id: string = randomUUID(),
): Promise<DeskRecord<T>> {
  const db = await database();
  const now = new Date().toISOString();
  await db.query(
    "INSERT INTO desk_records (id,kind,owner_id,revision,data,updated_at) VALUES (?,?,?,1,?,?)",
    [id, kind, ownerId, JSON.stringify(data), now],
  );
  return { id, kind, ownerId, revision: 1, data, updatedAt: now };
}
export async function updateRecord<T>(
  previous: DeskRecord<unknown>,
  data: T,
  db?: Storage,
) {
  const connection = db || (await database());
  const now = new Date().toISOString();
  await connection.query(
    "UPDATE desk_records SET data = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?",
    [
      JSON.stringify(data),
      previous.revision + 1,
      now,
      previous.id,
      previous.revision,
    ],
  );
  return { ...previous, revision: previous.revision + 1, data, updatedAt: now };
}
