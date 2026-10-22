import { actorFor, errorResponse } from "@/lib/http";
import { database } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await actorFor(request);
    const db = await database();
    const column =
      db.config.engine === "mysql" ? "`technicianName`" : '"technicianName"';
    const users = await db.query(
      `SELECT id, name, ${column} AS technician FROM desk_user WHERE status = ? AND ${column} <> ? ORDER BY ${column}`,
      ["active", ""],
    );
    return Response.json(
      { users },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
