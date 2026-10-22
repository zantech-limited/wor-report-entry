import { actorFor, jsonBody, errorResponse, HttpError } from "@/lib/http";
import { records, record, insertRecord, updateRecord } from "@/lib/records";
import { database } from "@/lib/storage";
import type { Alert } from "@/lib/field-model";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await actorFor(request);
    return Response.json(
      { alerts: await records<Alert>("alert", actor.id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await actorFor(request),
      body = await jsonBody(request, 20000),
      db = await database();
    if (body.acknowledge) {
      return await db.transaction(async () => {
        const row = await record<Alert>(body.acknowledge, true);
        if (!row || row.kind !== "alert" || row.ownerId !== actor.id)
          throw new HttpError("Alert not found.", 404);
        await updateRecord(row, { ...row.data, acknowledged: true });
        return Response.json({ ok: true });
      });
    }
    if (!["admin", "supervisor"].includes(actor.role))
      throw new HttpError("Your role cannot send alerts.", 403);
    if (
      typeof body.text !== "string" ||
      !body.text.trim() ||
      body.text.length > 2000 ||
      !Array.isArray(body.recipients) ||
      body.recipients.length < 1 ||
      body.recipients.length > 100
    )
      throw new HttpError("Invalid alert.");
    await db.transaction(async () => {
      for (const id of new Set<string>(body.recipients)) {
        if (
          !(await db
            .prepare("SELECT id FROM desk_user WHERE id = ? AND status = ?")
            .get(id, "active"))
        )
          throw new HttpError("Invalid alert recipient.");
        await insertRecord("alert", id, {
          text: body.text.trim(),
          urgent: body.urgent === true,
          acknowledged: false,
          sender: actor.name,
        });
      }
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
