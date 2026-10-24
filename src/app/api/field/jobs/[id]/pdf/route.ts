import { actorFor, errorResponse, HttpError } from "@/lib/http";
import { record } from "@/lib/records";
import { canSeeJob } from "@/lib/field-jobs";
import {
  customerSnapshot,
  type FieldJob,
  type CustomerSnapshot,
} from "@/lib/field-model";
import { customerPdf } from "@/lib/customer-pdf";
import { contentDisposition, workOrderPdfFilename } from "@/lib/pdf-name";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
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
    const filename = workOrderPdfFilename({
      wor: snapshot.line.wor,
      customer: snapshot.line.customer,
      date: snapshot.line.date,
    });
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(filename, download),
        "Cache-Control": "private, no-store",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy":
          "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
