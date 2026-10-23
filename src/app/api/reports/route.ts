import {legacyAccess} from "@/lib/access";
import { clientErrorMessage } from "@/lib/http";
import { NextResponse } from "next/server";
import { createBlankReport, listReports } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    return NextResponse.json(
      { error: clientErrorMessage(cause, "Could not start a new report.") },
      { status: 500 },
    );
  }
}
