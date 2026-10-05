import { NextResponse } from "next/server";
import { listParts } from "@/lib/parts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ parts: await listParts() });
}
