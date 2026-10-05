import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getReport, listReports, saveReport, whenReady } from "@/lib/db";
import { assertWritable, database } from "@/lib/storage";
import { logEvent } from "@/lib/events";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
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
  const denied = requireAdmin(request);
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
      await saveReport(report.id, report);
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
          /^(Enter |That month|Storage migration)/.test(error.message)
            ? error.message
            : "Could not update the prefix map.",
      },
      { status: 400 },
    );
  }
}
