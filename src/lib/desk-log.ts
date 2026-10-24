import { randomBytes } from "node:crypto";
import { sanitizeDiagnosticError } from "./diagnostics";

export type DeskEventKind = "error" | "review" | "upload";

export type DeskEvent = {
  at: string;
  reference: string;
  kind: DeskEventKind;
  message: string;
};

const events: DeskEvent[] = [];
const limit = 40;

function publicMessage(error: unknown) {
  const source =
    error instanceof Error && error.message
      ? error
      : new Error("The action could not be completed.");
  return sanitizeDiagnosticError(source)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .slice(0, 500);
}

export function rememberDeskEvent(kind: DeskEventKind, error: unknown) {
  const reference = randomBytes(4).toString("hex");
  events.unshift({
    at: new Date().toISOString(),
    reference,
    kind,
    message: publicMessage(error),
  });
  if (events.length > limit) events.length = limit;
  return reference;
}

export function recentDeskEvents() {
  return events.slice(0, 20).map((event) => ({ ...event }));
}

export function resetDeskEvents() {
  events.length = 0;
}
