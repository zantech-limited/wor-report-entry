import { database, assertWritable } from "./storage";
import { whenReady } from "./db";
import { logEvent } from "./events";
export type Technician = { name: string; active: boolean };
export async function technicianStates() {
  return (
    await (await database()).query("SELECT name, active FROM technicians")
  ).map((row) => ({
    name: String(row.name),
    active: Number(row.active) === 1,
  }));
}
export async function listTechnicians(): Promise<Technician[]> {
  await whenReady();
  const db = await database();
  const names = await db.query(
    "SELECT value FROM suggestions WHERE kind = 'tech'",
  );
  const states = await technicianStates();
  const map = new Map(names.map((row) => [String(row.value), true]));
  for (const row of states) map.set(row.name, row.active);
  return [...map]
    .map(([name, active]) => ({ name, active }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function saveTechnician(input: unknown) {
  const value = input as { name?: string; active?: boolean; oldName?: string };
  if (
    !value ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 255 ||
    typeof value.active !== "boolean"
  )
    throw new Error("Enter a technician name up to 255 characters.");
  if (
    value.oldName !== undefined &&
    (typeof value.oldName !== "string" || value.oldName.length > 255)
  )
    throw new Error("Invalid original name.");
  await whenReady();
  const db = await database();
  await db.transaction(async () => {
    assertWritable();
    const set = async (name: string, active: boolean) => {
      if (
        await db
          .prepare("SELECT name FROM technicians WHERE name = ?")
          .get(name)
      )
        await db.query("UPDATE technicians SET active = ? WHERE name = ?", [
          active ? 1 : 0,
          name,
        ]);
      else
        await db.query("INSERT INTO technicians (name, active) VALUES (?, ?)", [
          name,
          active ? 1 : 0,
        ]);
    };
    if (value.oldName?.trim() && value.oldName.trim() !== value.name!.trim())
      await set(value.oldName.trim(), false);
    await set(value.name!.trim(), value.active!);
  });
  logEvent(
    "technicians.updated",
    "Updated technician dropdown availability; historical work orders preserved.",
  );
}
