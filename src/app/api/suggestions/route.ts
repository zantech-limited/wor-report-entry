import {legacyAccess} from "@/lib/access";
import { NextResponse } from "next/server";
import { getSuggestions } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const accessDenied=await legacyAccess(request,["admin","manager","supervisor"]);if(accessDenied)return accessDenied;
  try {
    return NextResponse.json(await getSuggestions());
  } catch (error) {
    console.error("Service desk suggestions unavailable", error instanceof Error ? error.name : "Unknown");
    return NextResponse.json({ error: "Suggestions are temporarily unavailable." }, { status: 503 });
  }
}
