import { actorFor, jsonBody, errorResponse, HttpError } from "@/lib/http";
import { records, record, insertRecord, updateRecord } from "@/lib/records";
import { assignedUsers } from "@/lib/field-jobs";
import { database } from "@/lib/storage";
import type { Schedule } from "@/lib/field-model";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await actorFor(request);
    const rows = await records<Schedule>("schedule");
    return Response.json(
      {
        schedules: rows.filter(
          (row) =>
            actor.role !== "tech" || row.data.assignedIds.includes(actor.id),
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
    const actor = await actorFor(request, ["admin", "supervisor"]),
      body = await jsonBody(request, 20000);
    const data = body.schedule as Schedule;
    if (
      !data ||
      typeof data.start !== "string" ||
      typeof data.end !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.start) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.end) ||
      data.start >= data.end ||
      [data.customer, data.location, data.workRequired].some(
        (value) => typeof value !== "string" || value.length > 5000,
      ) ||
      !["scheduled", "cancelled"].includes(data.status)
    )
      throw new HttpError("Invalid schedule details.");
    await assignedUsers(data.assignedIds);
    const db = await database();
    return await db.transaction(async () => {
      const lock = await db
        .prepare(
          "SELECT value FROM meta WHERE key = ?" +
            (db.config.engine === "sqlite" ? "" : " FOR UPDATE"),
        )
        .get("accounts-ready");
      if (!lock) throw new HttpError("Accounts are not ready.");
      const previous = body.id ? await record<Schedule>(body.id, true) : null;
      if (
        previous &&
        (previous.kind !== "schedule" || previous.revision !== body.revision)
      )
        throw new HttpError("Conflict: the schedule changed.", 409);
      const normalized: Schedule = {
        assignedIds: data.assignedIds,
        customer: data.customer.trim(),
        location: data.location.trim(),
        start: data.start,
        end: data.end,
        workRequired: data.workRequired,
        status: data.status,
        jobId: previous?.data.jobId,
      };
      const overlaps = (await records<Schedule>("schedule")).filter(
        (row) =>
          row.id !== previous?.id &&
          row.data.status === "scheduled" &&
          row.data.start < data.end &&
          row.data.end > data.start &&
          row.data.assignedIds.some((id) => data.assignedIds.includes(id)),
      );
      const saved = previous
        ? await updateRecord(previous, normalized)
        : await insertRecord("schedule", actor.id, normalized);
      for (const user of data.assignedIds)
        await insertRecord("alert", user, {
          text: `Schedule ${previous ? "updated" : "assigned"}: ${data.customer}, ${data.start.replace("T", " ")}`,
          urgent: false,
          acknowledged: false,
          sender: actor.name,
        });
      return Response.json({
        schedule: saved,
        overlaps: overlaps.map((row) => row.id),
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
}
