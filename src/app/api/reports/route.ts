import {legacyAccess} from "@/lib/access";
import { NextResponse } from "next/server";
import { createBlankReport, listReports } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const accessDenied=await legacyAccess(request,["admin","manager","supervisor"]);if(accessDenied)return accessDenied;
  const reports = await listReports();
  return NextResponse.json({ reports });
}

export async function POST(request:Request) {
  const accessDenied=await legacyAccess(request,["admin"]);if(accessDenied)return accessDenied;
  try {
    const report = await createBlankReport();
    return NextResponse.json({ id: report.id });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not start a new report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
