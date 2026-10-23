import { actorFor, errorResponse } from "@/lib/http";
import { readFormLayout } from "@/lib/form-layout-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await actorFor(request);
    return Response.json(await readFormLayout(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
