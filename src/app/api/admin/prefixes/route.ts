import {legacyAccess} from "@/lib/access";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getReport, listReports, saveReportChecked, whenReady } from "@/lib/db";
import { assertWritable, database } from "@/lib/storage";
import { logEvent } from "@/lib/events";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 const guard=await legacyAccess(request,["admin","manager","supervisor"]);if(guard)return guard;
  const reports = await listReports();
  const id = new URL(request.url).searchParams.get("report") || reports[0]?.id;
  const report = id ? await getReport(id) : null;
  return NextResponse.json({
    reports,
    reportId: report?.id ?? "",
    prefixes: report?.prefixMap ?? [],
  });
}
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (
      typeof body.reportId !== "string" ||
      typeof body.prefix !== "string" ||
      body.prefix.trim().length !== 3 ||
      !["save", "remove"].includes(body.action)
    )
      throw new Error(
        "Enter a three-character serial prefix and choose a month.",
      );
    if (
      body.action === "save" &&
      (typeof body.model !== "string" ||
        !body.model.trim() ||
        body.model.length > 255 ||
        body.model.trim() === "Unknown Model")
    )
      throw new Error("Enter a real model name up to 255 characters.");
    await whenReady();
    const db = await database();
    await db.transaction(async () => {
      assertWritable();
      const report = await getReport(body.reportId);
      if (!report) throw new Error("That month was not found.");
      const prefix = body.prefix.trim().toUpperCase();
      report.prefixMap = report.prefixMap.filter(
        (entry) => entry.prefix.toUpperCase() !== prefix,
      );
      if (body.action === "save")
        report.prefixMap.push({ prefix, model: body.model.trim() });
      await saveReportChecked(report.id, report, "when-changed");
    });
    logEvent("prefixes.updated", "Updated a month's prefix map.");
    return NextResponse.json({
      prefixes: (await getReport(body.reportId))?.prefixMap ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error &&
          /^(Save conflict:|Enter |That month|Storage migration)/.test(error.message)
            ? error.message
            : "Could not update the prefix map.",
      },
      { status: error instanceof Error && error.message.startsWith("Save conflict:") ? 409 : 400 },
    );
  }
}
