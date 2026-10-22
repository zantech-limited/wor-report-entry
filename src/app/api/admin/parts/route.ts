import {legacyAccess} from "@/lib/access";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listParts, savePart, partUsage } from "@/lib/parts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request:Request) {
 const guard=await legacyAccess(request,["admin","manager","supervisor","tech"]);if(guard)return guard;
  const parts = await listParts(true);
  const { totalUses, usedPartNumbers } = await partUsage();
  return NextResponse.json({ parts, totalUses, usedPartNumbers });
}
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    await savePart(await request.json());
    const parts = await listParts(true);
    const { totalUses, usedPartNumbers } = await partUsage();
    return NextResponse.json({ parts, totalUses, usedPartNumbers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error &&
          /^(Enter |Default quantity|Invalid |Storage migration)/.test(
            error.message,
          )
            ? error.message
            : "Could not save that part.",
      },
      { status: 400 },
    );
  }
}
