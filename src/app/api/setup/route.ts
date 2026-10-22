import { jsonBody } from "@/lib/http";
import { protectAccountTables } from "@/lib/account-schema";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "@/lib/accounts";
import { database } from "@/lib/storage";
import { verifyToken, mayAttemptLogin } from "@/lib/admin-auth";
import { withAccountMail } from "@/lib/smtp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const db = await database();
  return Response.json({
    ready: !!(await db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("accounts-ready")),
  });
}
export async function POST(request: Request) {
  if (
    request.headers.get("origin") !==
    (process.env.APP_URL || new URL(request.url).origin)
  )
    return Response.json({ error: "Use the setup page." }, { status: 403 });
  if (!mayAttemptLogin())
    return Response.json({ error: "Wait before retrying." }, { status: 429 });
  if (Number(request.headers.get("content-length") || 0) > 8192)
    return Response.json(
      { error: "Setup request too large." },
      { status: 413 },
    );
  const body = await jsonBody(request, 8192).catch(() => null);
  if (!body || typeof body.token !== "string" || !verifyToken(body.token))
    return Response.json(
      { error: "The bootstrap token is incorrect." },
      { status: 401 },
    );
  const db = await database();
  if (
    await db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("accounts-ready")
  )
    return Response.json(
      { error: "Administrator setup is already complete." },
      { status: 409 },
    );
  try {
    await db.query("INSERT INTO meta (key,value) VALUES (?,?)", [
      "accounts-setup-lock",
      new Date().toISOString(),
    ]);
  } catch {
    return Response.json(
      {
        error:
          "Setup is already running. Ask the operator to inspect an interrupted setup if it does not finish.",
      },
      { status: 409 },
    );
  }
  try {
    if (
      typeof body.name !== "string" ||
      body.name.length > 255 ||
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      typeof body.password !== "string" ||
      body.password.length < 12 ||
      body.password.length > 128
    )
      throw new Error("Enter name, email and a password of 12-128 characters.");
    await (await getMigrations(auth().options)).runMigrations();
    await protectAccountTables(db);
    const result = await withAccountMail(() =>
      auth().api.signUpEmail({
        body: { name: body.name, email: body.email, password: body.password },
      }),
    );
    await db.transaction(async () => {
      await db.query(
        `UPDATE desk_user SET role = ?, status = ?, ${db.config.engine === "mysql" ? "`emailVerified`" : '"emailVerified"'} = ? WHERE id = ?`,
        [
          "admin",
          "active",
          ["postgres", "supabase"].includes(db.config.engine) ? "true" : 1,
          result.user.id,
        ],
      );
      await db.query("INSERT INTO meta (key,value) VALUES (?,?)", [
        "accounts-ready",
        "1",
      ]);
    });
    return Response.json({ ready: true });
  } catch {
    return Response.json(
      {
        error:
          "Setup failed. Check account details and database configuration; no existing workbook was replaced.",
      },
      { status: 400 },
    );
  } finally {
    await db.query("DELETE FROM meta WHERE key = ?", ["accounts-setup-lock"]);
  }
}
