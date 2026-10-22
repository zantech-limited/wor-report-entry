import type { Storage } from "./storage";
export const AUTH_TABLES = [
  "desk_user",
  "desk_session",
  "desk_account",
  "desk_verification",
  "desk_rate_limit",
] as const;
export async function protectAccountTables(db: Storage) {
  if (db.config.engine !== "supabase") return;
  for (const table of AUTH_TABLES) {
    await db.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await db.query(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated`);
  }
}
