import { currentActor } from "@/lib/accounts";
import { database } from "@/lib/storage";
import { databaseIdentifier } from "@/lib/database-identity";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await currentActor(request.headers);
  if (!actor) {
    const signedIn = /session/i.test(request.headers.get("cookie") || "");
    return Response.json(
      {
        error: signedIn
          ? "An approved account is required."
          : "Sign in again. This request did not include your session.",
      },
      { status: 401 },
    );
  }
  return Response.json(
    { actor, database: await databaseIdentifier(await database()) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
