import { actorFor, errorResponse, HttpError, jsonBody } from "@/lib/http";
import { record } from "@/lib/records";
import { canSeeJob, hashSnapshot } from "@/lib/field-jobs";
import {
  customerSnapshot,
  emptyJob,
  sanitizeCustomerSnapshot,
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
    return pdfResponse(snapshot, approved, request);
  } catch (error) {
    return errorResponse(error);
  }
}

/** The edit page sends the open form, including a signature that has not synced yet. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await actorFor(request),
      { id } = await context.params,
      row = await record<FieldJob>(id);
    if (!row || row.kind !== "job" || !canSeeJob(actor, row))
      throw new HttpError("Work order not found.", 404);
    const body = await jsonBody(request, 1_000_000);
    let snapshot: CustomerSnapshot;
    try {
      snapshot = sanitizeCustomerSnapshot(
        body && typeof body === "object" ? body.snapshot : undefined,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new HttpError(
        message.startsWith("Invalid") ? message : "Invalid work order preview.",
      );
    }
    const signedId = row.data.signedRevisionId;
    let approved = false;
    if (signedId) {
      const signed = await record<{
        jobId: string;
        snapshot: CustomerSnapshot;
      }>(signedId);
      if (signed && signed.kind === "signed" && signed.data.jobId === id) {
        approved =
          hashSnapshot(jobFromSnapshot(signed.data.snapshot)) ===
          hashSnapshot(jobFromSnapshot(snapshot));
      }
    }
    return pdfResponse(snapshot, approved, request);
  } catch (error) {
    return errorResponse(error);
  }
}

function jobFromSnapshot(snapshot: CustomerSnapshot): FieldJob {
  const job = emptyJob(snapshot.line.id || "preview");
  return {
    ...job,
    line: { ...job.line, ...snapshot.line },
    fields: { ...job.fields, ...snapshot.fields },
    signature: snapshot.signature ?? undefined,
    technicianSignature: snapshot.technicianSignature ?? undefined,
  };
}

function pdfResponse(
  snapshot: CustomerSnapshot,
  approved: boolean,
  request: Request,
) {
  return customerPdf(snapshot, { approved }).then((bytes) => {
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
  });
}
