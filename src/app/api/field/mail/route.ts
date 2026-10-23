import { actorFor, jsonBody, errorResponse, HttpError } from "@/lib/http";
import { smtpSettings, saveSmtpSettings, sendSmtp } from "@/lib/smtp";
import { drainMailQueue } from "@/lib/mail-queue";
import { records, record, updateRecord } from "@/lib/records";
import { database } from "@/lib/storage";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const actor = await actorFor(request),
      isAdmin = actor.role === "admin";
    const deliveries = await records<{
      state: string;
      jobId: string;
      to: string;
      lastError?: string;
    }>("customer-mail", isAdmin ? undefined : actor.id);
    if (!isAdmin)
      return Response.json(
        { deliveries },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const { password, ...settings } = await smtpSettings();
    const accounts = await records<{
      state: string;
      to: string;
      lastError?: string;
    }>("account-mail");
    return Response.json(
      {
        settings: { ...settings, passwordSet: !!password },
        deliveries: [
          ...deliveries,
          ...accounts.map((row) => ({
            ...row,
            data: {
              state: row.data.state,
              to: row.data.to,
              lastError: row.data.lastError,
            },
          })),
        ],
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    await actorFor(request, ["admin"]);
    const body = await jsonBody(request, 20000);
    if (body.settings) await saveSmtpSettings(body.settings);
    if (body.testRecipient)
      await sendSmtp(
        body.testRecipient,
        "Zantech SMTP test",
        "This is a requested SMTP connection test. No customer work-order data is included.",
      );
    if (body.retry) {
      const db = await database();
      await db.transaction(async () => {
        const row = await record<{ state: string; attempts: number }>(
          body.retry,
          true,
        );
        if (!row || !["account-mail", "customer-mail"].includes(row.kind))
          throw new HttpError("Delivery not found.", 404);
        if (row.data.state === "uncertain" && body.confirmUncertain !== true)
          throw new HttpError(
            "Confirm provider delivery status before retrying an uncertain delivery.",
          );
        if (["sent", "sending"].includes(row.data.state))
          throw new HttpError(
            "This delivery cannot be retried in its current state.",
          );
        await updateRecord(row, { ...row.data, state: "queued", attempts: 0 });
      });
    }
    return Response.json({
      ok: true,
      results: body.process ? await drainMailQueue(10) : [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
