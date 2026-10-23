import { actorFor, jsonBody, errorResponse, HttpError } from "@/lib/http";
import { after } from "next/server";
import { processMailQueue } from "@/lib/mail-queue";
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
  try {
    const actor = await actorFor(request, ["tech", "admin"]);
    const body = await jsonBody(request);
    const result = await saveFieldJob(
      actor,
      body.id,
      body.job,
      body.revision,
      body.operationId,
      body.submit === true,
    );
    if (body.submit === true) {
      try {
        after(async () => { try { await processMailQueue(1); } catch { /* Queue remains retryable. */ } });
      } catch {
        /* The job is already durable; Admin can retry the queue. */
      }
    }
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
