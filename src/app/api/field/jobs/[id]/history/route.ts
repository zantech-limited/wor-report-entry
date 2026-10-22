import { actorFor, errorResponse, HttpError } from "@/lib/http";
import { record, records } from "@/lib/records";
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
    const signed = await records<{ jobId: string; signedAt: string }>("signed"),
      events = await records<{
        jobId: string;
        revision: number;
        reason: string;
        action: string;
      }>("audit");
    return Response.json(
      {
        signed: signed
          .filter((item) => item.data.jobId === id)
          .map((item) => ({ id: item.id, signedAt: item.data.signedAt })),
        events: events
          .filter((item) => item.data.jobId === id)
          .map((item) => ({
            time: item.updatedAt,
            revision: item.data.revision,
            reason: item.data.reason,
            action: item.data.action,
          })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
