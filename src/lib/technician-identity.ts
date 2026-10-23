import type { Storage } from "./storage";
import { nameKey } from "./model";

export type LinkedTechnician = { id: string; name: string; technician: string };

/** Active accounts that can be chosen on a form, including an admin with technician history. */
export async function linkedTechnicianIdentities(db: Storage): Promise<LinkedTechnician[]> {
  let users: Record<string, unknown>[];
  try {
    const column = db.config.engine === "mysql" ? "`technicianName`" : '"technicianName"';
    users = await db.query(
      `SELECT id, name, role, ${column} AS technician FROM desk_user WHERE status = ?`,
      ["active"],
    );
  } catch {
    return [];
  }
  let history = new Map<string, string>();
  try {
    history = new Map(
      (await db.query("SELECT value FROM suggestions WHERE kind = 'tech'")).map((row) => [
        nameKey(String(row.value)),
        String(row.value),
      ]),
    );
  } catch {
    history = new Map();
  }
  const identities: LinkedTechnician[] = [];
  for (const row of users) {
    const explicit = String(row.technician || "").trim();
    const first = String(row.name || "").trim().split(/\s+/)[0] || "";
    const technician = explicit || history.get(nameKey(first)) || "";
    if (!technician || technician.length > 255) continue;
    identities.push({
      id: String(row.id),
      name: String(row.name || ""),
      technician,
    });
  }
  return identities;
}
