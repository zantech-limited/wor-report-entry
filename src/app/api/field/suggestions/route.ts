import { suggestionsForActor } from "@/lib/field-suggestions";
import { actorFor, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await actorFor(request);
    return Response.json(await suggestionsForActor(actor), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
