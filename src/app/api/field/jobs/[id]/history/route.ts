import { actorFor, errorResponse, HttpError } from "@/lib/http";
import { record, recordsWhere } from "@/lib/records";
import { canSeeJob } from "@/lib/field-jobs";
import type { FieldJob } from "@/lib/field-model";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await actorFor(request),
      { id } = await context.params,
      row = await record<FieldJob>(id);
    if (!row || row.kind !== "job" || !canSeeJob(actor, row))
      throw new HttpError("Work order not found.", 404);
    const signed = await recordsWhere<{ jobId: string; signedAt: string }>("signed", "jobId", [id]),
      events = await recordsWhere<{
        jobId: string;
        revision: number;
        reason: string;
        action: string;
        actorName?: string;
        at?: string;
      }>("audit", "jobId", [id]),
      history = await recordsWhere<{
        jobId: string;
        revision: number;
        reason?: string;
        actorName?: string;
        at?: string;
      }>("job-history", "jobId", [id]);
    const amendments = history
      .filter((item) => item.data.reason?.trim())
      .map((item) => ({
        time: item.data.at || item.updatedAt,
        revision: item.data.revision,
        reason: item.data.reason || "",
        actorName: item.data.actorName || "",
      }));
    return Response.json(
      {
        signed: signed
          .filter((item) => item.data.jobId === id)
          .map((item) => ({ id: item.id, signedAt: item.data.signedAt })),
        amendments,
        events: events
          .filter((item) => item.data.jobId === id)
          .map((item) => ({
            time: item.data.at || item.updatedAt,
            revision: item.data.revision,
            reason: item.data.reason,
            action: item.data.action,
            actorName: item.data.actorName || "",
          })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
