import nodemailer from "nodemailer";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { accountSecret } from "./accounts";
import { record, insertRecord, updateRecord } from "./records";
import { database } from "./storage";
import { safeMailHeader } from "./mail-header";
import { AsyncLocalStorage } from "node:async_hooks";
export type SmtpSettings = {
  mode: "disabled" | "test" | "smtp";
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  replyTo: string;
};
const defaults: SmtpSettings = {
  mode: "disabled",
  host: "",
  port: 587,
  username: "",
  password: "",
  from: "",
  replyTo: "",
};
function key() {
  return createHash("sha256").update(accountSecret()).digest();
}
export function encryptSecret(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decryptSecret(value: string) {
  const bytes = Buffer.from(value, "base64"),
    cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    cipher.update(bytes.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
export async function smtpSettings() {
  const row = await record<{ value: string }>("smtp-settings");
  return row
    ? (JSON.parse(decryptSecret(row.data.value)) as SmtpSettings)
    : { ...defaults };
}
export async function saveSmtpSettings(input: SmtpSettings) {
  if (
    !["disabled", "test", "smtp"].includes(input.mode) ||
    typeof input.host !== "string" ||
    input.host.length > 255 ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    [input.from, input.replyTo, input.username, input.password].some(
      (v) => typeof v !== "string" || v.length > 2048 || /[\r\n]/.test(v),
    )
  )
    throw new Error("Invalid SMTP settings.");
  if (
    input.mode !== "disabled" &&
    (!input.host || !/^\S+@\S+\.\S+$/.test(input.from))
  )
    throw new Error("SMTP host and sender email are required.");
  if (input.mode === "test" && process.env.VERCEL)
    throw new Error("Use SMTP with verified TLS on Vercel.");
  const previous = await smtpSettings();
  if (!input.password) input.password = previous.password;
  const db = await database();
  await db.transaction(async () => {
    const row = await record("smtp-settings", true),
      data = { value: encryptSecret(JSON.stringify(input)) };
    if (row) await updateRecord(row, data, db);
    else await insertRecord("settings", "system", data, "smtp-settings");
  });
}
export async function sendSmtp(
  to: string,
  subject: string,
  text: string,
  attachment?: { filename: string; content: Buffer },
) {
  const settings = await smtpSettings();
  if (settings.mode === "disabled") throw new Error("SMTP is not configured.");
  if (!/^\S+@\S+\.\S+$/.test(to) || /[\r\n]/.test(to) || to.length > 254)
    throw new Error("Invalid recipient email.");
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    requireTLS: settings.mode === "smtp",
    auth: settings.username
      ? { user: settings.username, pass: settings.password }
      : undefined,
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
  const from = safeMailHeader(settings.from, 254);
  const replyTo = safeMailHeader(settings.replyTo, 254);
  const safeSubject = safeMailHeader(subject) || "Zantech service desk";
  return transport.sendMail({
    from,
    replyTo: replyTo || undefined,
    to,
    subject: safeSubject,
    text,
    attachments: attachment ? [attachment] : [],
  });
}
type PendingAccountMessage = { to: string; subject: string; body: string };
const globalMail = globalThis as unknown as {
  deskAccountMessages?: AsyncLocalStorage<PendingAccountMessage[]>;
};
const accountMessages = (globalMail.deskAccountMessages ??=
  new AsyncLocalStorage<PendingAccountMessage[]>());
export async function withAccountMail<T>(work: () => Promise<T>): Promise<T> {
  const messages: { to: string; subject: string; body: string }[] = [];
  const result = await accountMessages.run(messages, work);
  for (const message of messages)
    await insertRecord("account-mail", "system", {
      ...message,
      state: "queued",
      attempts: 0,
    });
  return result;
}
export async function sendAccountMail(
  to: string,
  subject: string,
  url: string,
) {
  const messages = accountMessages.getStore();
  if (!messages)
    throw new Error(
      "Account mail must run after the authentication transaction.",
    );
  messages.push({ to, subject, body: `${subject}\n\n${url}` });
}
