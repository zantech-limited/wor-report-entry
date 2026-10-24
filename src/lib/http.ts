import { assertWritable } from "./storage";
import { currentActor, type Actor, type Role } from "./accounts";
import { rememberDeskEvent, type DeskEventKind } from "./desk-log";
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function actorFor(
  request: Request,
  roles: Role[] = ["tech", "supervisor", "manager", "admin"],
): Promise<Actor> {
  const actor = await currentActor(request.headers);
  if (!actor) throw new HttpError("Sign in with an approved account.", 401);
  if (!roles.includes(actor.role))
    throw new HttpError("Your role cannot perform this action.", 403);
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("origin") !==
      (process.env.APP_URL || new URL(request.url).origin)
  )
    throw new HttpError("Use the service desk's own page.", 403);
  if (!["GET", "HEAD"].includes(request.method)) assertWritable();
  return actor;
}
export async function jsonBody(request: Request, max = 500000) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new HttpError("Request is too large.", 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > max)
    throw new HttpError("Request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError("Invalid JSON request.");
  }
}
const publicError =
  /^(Conflict:|Choose |Enter |Date |Invalid |Work order|Work orders |Only |Your |You |An assigned|Each assigned|Customer-visible|The signed|Complete |Submitted |Ask Admin|Describe |That schedule|Include |Changing the month|Completion |SMTP |Use SMTP|This workbook|The workbook package|Template |Master sheet|Workbook is missing cell|Copycount|Unsupported backup|This backup|Storage migration|Save conflict:|Recovery snapshot|That report|Report exceeds|customer must|location must|technician must|secondaryTech must|No work orders|Vercel requires|Configure AUTH_SECRET|Configure APP_URL)/;

export function clientErrorMessage(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : "";
  return publicError.test(text) ? text : fallback;
}

const expectedError =
  /^(Conflict:|Choose |Enter |Date |Invalid |Work order |Work orders |Only |Your |You |An assigned|Each assigned|Customer-visible|The signed|Complete |Submitted |Ask Admin|Describe |That schedule|Include |Changing the month|Completion |SMTP |Use SMTP)/;

export function errorResponse(
  error: unknown,
  options?: { reference?: string; kind?: DeskEventKind },
) {
  if (error instanceof HttpError)
    return Response.json(
      {
        error: error.message,
        ...(options?.reference ? { reference: options.reference } : {}),
      },
      { status: error.status },
    );
  const text = error instanceof Error ? error.message : "";
  if (/^(Vercel requires|Configure AUTH_SECRET|Configure APP_URL)/.test(text))
    return Response.json({ error: text }, { status: 503 });
  const unexpected = !expectedError.test(text);
  const reference =
    options?.reference ||
    (unexpected ? rememberDeskEvent(options?.kind || "error", error) : undefined);
  if (unexpected)
    console.error("Service desk operation failed", {
      name: error instanceof Error ? error.name : "Unknown",
      code: (error as { code?: string })?.code,
      reference,
    });
  const safe = expectedError.test(text)
    ? text
    : "The action could not be completed. Your local draft is retained; please retry.";
  return Response.json(
    { error: safe, ...(reference ? { reference } : {}) },
    { status: safe.startsWith("Conflict:") ? 409 : 400 },
  );
}
