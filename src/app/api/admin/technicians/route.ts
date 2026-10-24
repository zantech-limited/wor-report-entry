import {legacyAccess} from "@/lib/access";
import { HttpError, jsonBody } from "@/lib/http";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listTechnicians, saveTechnician } from "@/lib/technicians";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request:Request) {
 const guard=await legacyAccess(request,["admin","manager","supervisor","tech"]);if(guard)return guard;
  return NextResponse.json({ technicians: await listTechnicians() });
}
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    await saveTechnician(await jsonBody(request, 262144));
    return NextResponse.json({ technicians: await listTechnicians() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : error instanceof Error &&
                /^(Enter |Invalid |Storage migration)/.test(error.message)
              ? error.message
              : "Could not update technicians.",
      },
      { status: error instanceof HttpError ? error.status : 400 },
    );
  }
}
