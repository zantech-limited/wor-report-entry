import { withAccountMail } from "@/lib/smtp";
import { actorFor, jsonBody, errorResponse, HttpError } from "@/lib/http";
import { auth, ROLES } from "@/lib/accounts";
import { database } from "@/lib/storage";
import { insertRecord } from "@/lib/records";
import { randomBytes } from "node:crypto";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await actorFor(request, ["admin"]);
    const db = await database();
    return Response.json(
      {
        users: await db.query(
          `SELECT id,name,email,role,status,${db.config.engine === "mysql" ? "`technicianName`" : '"technicianName"'} AS technician FROM desk_user ORDER BY name`,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await actorFor(request, ["admin"]),
      body = await jsonBody(request, 10000);
    if (body.invite) {
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 255 ||
        typeof body.email !== "string" ||
        body.email.length > 254
      )
        throw new HttpError("Invalid invitation.");
      await withAccountMail(() =>
        auth().api.signUpEmail({
          body: {
            name: body.name,
            email: body.email,
            password: randomBytes(32).toString("hex"),
          },
        }),
      );
      await withAccountMail(() =>
        auth().api.requestPasswordReset({
          body: {
            email: body.email,
            redirectTo: `${process.env.APP_URL || new URL(request.url).origin}/login`,
          },
        }),
      );
      return Response.json({ invited: true });
    }
    if (
      typeof body.id !== "string" ||
      !ROLES.includes(body.role) ||
      !["pending", "active", "archived"].includes(body.status) ||
      typeof body.technician !== "string" ||
      body.technician.trim().length > 255
    )
      throw new HttpError("Invalid account settings.");
    const db = await database();
    return await db.transaction(async () => {
      await db
        .prepare(
          "SELECT value FROM meta WHERE key = ?" +
            (db.config.engine === "sqlite" ? "" : " FOR UPDATE"),
        )
        .get("accounts-ready");
      const user = await db
        .prepare("SELECT id,role,status FROM desk_user WHERE id = ?")
        .get(body.id);
      if (!user) throw new HttpError("Account not found.", 404);
      if (
        user.role === "admin" &&
        user.status === "active" &&
        (body.role !== "admin" || body.status !== "active")
      ) {
        const admins = await db.query(
          "SELECT id FROM desk_user WHERE role = ? AND status = ?",
          ["admin", "active"],
        );
        if (admins.length <= 1)
          throw new HttpError("The last active Admin cannot be removed.");
      }
      if (
        body.status === "active" &&
        body.role === "tech" &&
        !body.technician.trim()
      )
        throw new HttpError(
          "Choose a technician identity before approving this account.",
        );
      const column =
        db.config.engine === "mysql" ? "`technicianName`" : '"technicianName"';
      if (body.technician.trim()) {
        const same = await db.query(
          `SELECT id FROM desk_user WHERE LOWER(${column}) = ? AND id <> ? AND status = ?`,
          [body.technician.trim().toLowerCase(), body.id, "active"],
        );
        if (same.length && body.status === "active")
          throw new HttpError("Choose a distinct technician identity.");
      }
      await db.query(
        `UPDATE desk_user SET role = ?, status = ?, ${column} = ? WHERE id = ?`,
        [body.role, body.status, body.technician.trim(), body.id],
      );
      if (body.technician.trim()) {
        const technician = body.technician.trim();
        const linked = await db.query(
          `SELECT id FROM desk_user WHERE LOWER(${column}) = ? AND status = ?`,
          [technician.toLowerCase(), "active"],
        );
        const active = linked.length ? 1 : 0;
        const existing = await db
          .prepare("SELECT name FROM technicians WHERE LOWER(name) = LOWER(?)")
          .get(technician);
        if (existing)
          await db.query(
            "UPDATE technicians SET active = ? WHERE LOWER(name) = LOWER(?)",
            [active, technician],
          );
        else
          await db.query("INSERT INTO technicians (name,active) VALUES (?,?)", [
            technician,
            active,
          ]);
      }
      await db.query(
        "DELETE FROM desk_session WHERE " +
          (db.config.engine === "mysql" ? "`userId`" : '"userId"') +
          " = ?",
        [body.id],
      );
      await insertRecord("audit", actor.id, {
        action: "account.updated",
        userId: body.id,
        role: body.role,
        status: body.status,
      });
      return Response.json({ ok: true });
    });
  } catch (error) {
    return errorResponse(error);
  }
}
