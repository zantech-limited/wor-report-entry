import { database, assertWritable } from "./storage";
import {
  defaultFormLayout,
  validateFormLayout,
  type FormLayout,
} from "./form-layout";

const key = "customer-form-layout-v1";
export type PublishedFormLayout = { revision: number; layout: FormLayout };
export async function readFormLayout(): Promise<PublishedFormLayout> {
  const db = await database();
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  if (!row) return { revision: 0, layout: defaultFormLayout() };
  const saved = JSON.parse(String(row.value)) as PublishedFormLayout;
  return { revision: saved.revision, layout: validateFormLayout(saved.layout) };
}
export async function publishFormLayout(
  layout: unknown,
  revision: number,
): Promise<PublishedFormLayout> {
  const validated = validateFormLayout(layout);
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error("Invalid layout revision.");
  assertWritable();
  const db = await database();
  return db.transaction(async () => {
    await db.query(
      "INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING",
      [key, JSON.stringify({ revision: 0, layout: defaultFormLayout() })],
    );
    const row = await db
      .prepare(
        "SELECT value FROM meta WHERE key = ?" +
          (db.config.engine === "sqlite" ? "" : " FOR UPDATE"),
      )
      .get(key);
    const previous = JSON.parse(String(row.value)) as PublishedFormLayout;
    if (previous.revision !== revision)
      throw new Error(
        "Conflict: another administrator changed the layout. Reload the published layout before editing.",
      );
    const next = { revision: revision + 1, layout: validated };
    await db.query("UPDATE meta SET value = ? WHERE key = ?", [
      JSON.stringify(next),
      key,
    ]);
    return next;
  });
}
