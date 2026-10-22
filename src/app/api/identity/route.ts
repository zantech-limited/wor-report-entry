import { currentActor } from "@/lib/accounts";
import { database } from "@/lib/storage";
import { databaseIdentifier } from "@/lib/database-identity";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await currentActor(request.headers);
  if (!actor)
    return Response.json(
      { error: "An approved account is required." },
      { status: 401 },
    );
  return Response.json(
    { actor, database: await databaseIdentifier(await database()) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
