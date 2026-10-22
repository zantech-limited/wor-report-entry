import { NextResponse } from "next/server";
import { currentActor, type Role } from "./accounts";

export async function legacyAccess(
  request: Request,
  roles: Role[] = ["admin", "manager", "supervisor"],
) {
  const actor = await currentActor(request.headers);
  if (!actor)
    return NextResponse.json(
      { error: "Sign in with an approved account." },
      { status: 401 },
    );
  if (!roles.includes(actor.role))
    return NextResponse.json(
      { error: "Your role cannot access this action." },
      { status: 403 },
    );
  if (!["GET", "HEAD"].includes(request.method)) {
    const expected = process.env.APP_URL || new URL(request.url).origin;
    if (request.headers.get("origin") !== expected)
      return NextResponse.json(
        { error: "Use the service desk's own page." },
        { status: 403 },
      );
  }
  return null;
}
