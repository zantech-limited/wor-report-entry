import { actorFor, errorResponse, HttpError } from "@/lib/http";
import { record } from "@/lib/records";
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
      job = await record<FieldJob>(id);
    if (!job || job.kind !== "job" || !canSeeJob(actor, job))
      throw new HttpError("Work order not found.", 404);
    return Response.json(
      { job },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
