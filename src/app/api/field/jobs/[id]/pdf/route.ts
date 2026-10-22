import { actorFor, errorResponse, HttpError } from "@/lib/http";
import { record } from "@/lib/records";
import { canSeeJob } from "@/lib/field-jobs";
import {
  customerSnapshot,
  type FieldJob,
  type CustomerSnapshot,
} from "@/lib/field-model";
import { customerPdf } from "@/lib/customer-pdf";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
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
    const requested = new URL(request.url).searchParams.get("revision");
    const signedId = requested || row.data.signedRevisionId;
    let snapshot = customerSnapshot(row.data),
      approved = false;
    if (signedId) {
      const signed = await record<{
        jobId: string;
        snapshot: CustomerSnapshot;
      }>(signedId);
      if (!signed || signed.kind !== "signed" || signed.data.jobId !== id)
        throw new HttpError("Signed copy not found.", 404);
      snapshot = signed.data.snapshot;
      approved = true;
    }
    const bytes = await customerPdf(snapshot, { approved });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Zantech-work-order-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
