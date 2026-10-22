import { auth, accountsEnabled } from "@/lib/accounts";
import { database, writesPaused } from "@/lib/storage";
import { withAccountMail } from "@/lib/smtp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(request: Request) {
  if (writesPaused())
    return Response.json(
      { error: "Storage is switching. Please retry after restart." },
      { status: 503 },
    );
  if (!accountsEnabled())
    return Response.json({ error: "Accounts are disabled." }, { status: 503 });
  const db = await database();
  if (
    !(await db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("accounts-ready"))
  )
    return Response.json(
      { error: "Complete administrator setup first." },
      { status: 503 },
    );
  const response = await withAccountMail(() => auth().handler(request));
  // Account verification should arrive without waiting for a scheduled retry.
  if (request.method === "POST") {
    try {
      const { smtpSettings } = await import("@/lib/smtp");
      if ((await smtpSettings()).mode !== "disabled") {
        const { processMailQueue } = await import("@/lib/mail-queue");
        await processMailQueue(1);
      }
    } catch {
      /* A durable queued message remains available for retry. */
    }
  }
  return response;
}
export const GET = handler;
export const POST = handler;
