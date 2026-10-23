import { database } from "./storage";
import { records, record, updateRecord } from "./records";
import { sendSmtp } from "./smtp";
import { customerPdf } from "./customer-pdf";
import type { CustomerSnapshot } from "./field-model";
type Delivery = {
  to: string;
  subject?: string;
  body?: string;
  jobId?: string;
  signedRevisionId?: string;
  state: string;
  attempts: number;
  leaseUntil?: string;
  lastError?: string;
  sentAt?: string;
};
export async function processMailQueue(limit = 2) {
  const db = await database(),
    candidates = [
      ...(await records<Delivery>("customer-mail")),
      ...(await records<Delivery>("account-mail")),
    ]
      .filter((row) => ["queued", "sending"].includes(row.data.state))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, limit),
    results = [];
  for (const candidate of candidates) {
    const claimed = await db.transaction(async () => {
      const row = await record<Delivery>(candidate.id, true);
      if (!row) return null;
      if (row.data.state === "sending") {
        if (
          row.data.leaseUntil &&
          row.data.leaseUntil < new Date().toISOString()
        )
          await updateRecord(row, {
            ...row.data,
            state: "uncertain",
            lastError:
              "The sender stopped before recording a result. Check delivery before retrying.",
          });
        return null;
      }
      if (row.data.state !== "queued" || row.data.attempts >= 5) return null;
      return updateRecord(row, {
        ...row.data,
        state: "sending",
        attempts: row.data.attempts + 1,
        leaseUntil: new Date(Date.now() + 120000).toISOString(),
      });
    });
    if (!claimed) continue;
    try {
      if (claimed.kind === "account-mail")
        await sendSmtp(
          claimed.data.to,
          claimed.data.subject || "Service desk account",
          claimed.data.body || "",
        );
      else {
        const signed = await record<{ snapshot: CustomerSnapshot }>(
          claimed.data.signedRevisionId || "",
        );
        if (!signed || signed.kind !== "signed")
          throw new Error("The frozen customer copy is unavailable.");
        const reference = signed.data.snapshot.line.wor;
        const bytes = await customerPdf(signed.data.snapshot, {
          approved: true,
        });
        await sendSmtp(
          claimed.data.to,
          `Zantech work order ${reference}`,
          `Please find your completed work order ${reference} attached.\n\nZantech Limited`,
          {
            filename: `Zantech-work-order-${reference.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
            content: bytes,
          },
        );
      }
      await db.transaction(async () => {
        const row = await record<Delivery>(claimed.id, true);
        if (row && row.data.state === "sending")
          await updateRecord(row, {
            ...row.data,
            state: "sent",
            sentAt: new Date().toISOString(),
            leaseUntil: undefined,
            lastError: undefined,
          });
      });
      results.push({ id: claimed.id, state: "sent" });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      const raw = error instanceof Error ? error.message : "";
      const safeError = /^(SMTP is not configured\.|Invalid recipient email\.|The frozen customer copy is unavailable\.)$/.test(
        raw,
      )
        ? raw
        : "Delivery did not complete. Check SMTP settings and provider delivery history before retrying.";
      const safeRetry = ["EAUTH", "ECONNECTION", "EDNS", "ETLS"].includes(code);
      await db.transaction(async () => {
        const row = await record<Delivery>(claimed.id, true);
        if (row)
          await updateRecord(row, {
            ...row.data,
            state:
              safeRetry && row.data.attempts < 5
                ? "queued"
                : code === "ETIMEDOUT"
                  ? "uncertain"
                  : "failed",
            leaseUntil: undefined,
            lastError: safeError,
          });
      });
      results.push({ id: claimed.id, state: "failed", error: safeError });
    }
  }
  return results;
}

/** Send queued mail until the queue is idle, a delivery fails, or the time box ends. */
export async function drainMailQueue(max = 20) {
  const results: Awaited<ReturnType<typeof processMailQueue>> = [];
  const seen = new Set<string>();
  const started = Date.now();
  while (results.length < max && Date.now() - started < 45_000) {
    const batch = await processMailQueue(1);
    const item = batch[0];
    if (!item || seen.has(item.id)) break;
    seen.add(item.id);
    results.push(item);
    if (item.state !== "sent") break;
  }
  return results;
}
