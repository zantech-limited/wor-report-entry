import { requireAdmin } from "@/lib/admin-auth";
import { jsonBody, errorResponse } from "@/lib/http";
import { publishFormLayout, readFormLayout } from "@/lib/form-layout-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;
    return Response.json(await readFormLayout(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;
    const body = await jsonBody(request, 20000);
    return Response.json(await publishFormLayout(body.layout, body.revision));
  } catch (error) {
    return errorResponse(error);
  }
}
