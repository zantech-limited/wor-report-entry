import { actorFor, errorResponse } from "@/lib/http";
import { database } from "@/lib/storage";
import { linkedTechnicianIdentities } from "@/lib/technician-identity";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await actorFor(request);
    const users = (await linkedTechnicianIdentities(await database())).sort((a, b) =>
      a.technician.localeCompare(b.technician),
    );
    return Response.json(
      { users },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
