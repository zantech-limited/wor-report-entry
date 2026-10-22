import {legacyAccess} from "@/lib/access";
import { NextResponse } from "next/server";
import { getSuggestions } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const accessDenied=await legacyAccess(request,["admin","manager","supervisor"]);if(accessDenied)return accessDenied;
  const suggestions = await getSuggestions();
  return NextResponse.json(suggestions);
}
