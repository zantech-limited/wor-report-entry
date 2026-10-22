import {legacyAccess} from "@/lib/access";
import { NextResponse } from "next/server";
import { listParts } from "@/lib/parts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request:Request) {
  const accessDenied=await legacyAccess(request,["admin","manager","supervisor","tech"]);if(accessDenied)return accessDenied;
  return NextResponse.json({ parts: await listParts() });
}
