import {legacyAccess} from "@/lib/access";
import { NextResponse } from "next/server";
import { listParts } from "@/lib/parts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request:Request) {
  const accessDenied=await legacyAccess(request,["admin","manager","supervisor","tech"]);if(accessDenied)return accessDenied;
  try {
    return NextResponse.json({ parts: await listParts() });
  } catch (error) {
    console.error("Service desk parts unavailable", error instanceof Error ? error.name : "Unknown");
    return NextResponse.json({ error: "The parts list is temporarily unavailable." }, { status: 503 });
  }
}
