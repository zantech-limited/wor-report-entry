import { rememberDeskEvent } from "@/lib/desk-log";
import { actorFor, jsonBody, errorResponse, HttpError } from "@/lib/http";
import { processMailQueue } from "@/lib/mail-queue";
import { records } from "@/lib/records";
import { visibleJobs, saveFieldJob } from "@/lib/field-jobs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await actorFor(request);
    const month =
      new URL(request.url).searchParams.get("month") ||
      new Date()
        .toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" })
        .slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new HttpError("Choose a month.");
    return Response.json(
      { jobs: await visibleJobs(actor, month) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  let submit = false;
  try {
    const actor = await actorFor(request, ["tech", "admin"]);
    const body = await jsonBody(request);
    submit = body.submit === true;
    const result = await saveFieldJob(
      actor,
      body.id,
      body.job,
      body.revision,
      body.operationId,
      submit,
    );
    let mail: { state: string; error?: string } | undefined;
    if (submit) {
      try {
        await processMailQueue(1);
        const queued = (await records<{
          jobId?: string;
          state?: string;
          lastError?: string;
        }>("customer-mail")).find((row) => row.data.jobId === body.id);
        mail = queued
          ? { state: String(queued.data.state || "queued"), error: queued.data.lastError }
          : { state: "queued" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        mail = {
          state: "failed",
          error: /^SMTP is not configured\./.test(message)
            ? message
            : "Customer email could not be sent. Check SMTP settings in Team & SMTP.",
        };
      }
    }
    return Response.json({ ...result, mail });
  } catch (error) {
    const reference = rememberDeskEvent(submit ? "review" : "upload", error);
    return errorResponse(error, { reference, kind: submit ? "review" : "upload" });
  }
}
