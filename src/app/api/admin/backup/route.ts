import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createBackup, restoreBackup } from "@/lib/backups";
import { logEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const backup = await createBackup();
    logEvent("backup.downloaded", "Created a portable backup.");
    return new NextResponse(JSON.stringify(backup), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="service-desk-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not create a backup." },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 100 * 1024 * 1024)
      throw new Error("Choose a JSON backup smaller than 100 MB.");
    const count = await restoreBackup(JSON.parse(await file.text()));
    return NextResponse.json({
      message: `Restored ${count} months as new copies. Existing reports and catalog entries were preserved.`,
    });
  } catch (error) {
    logEvent(
      "backup.error",
      "Backup restore failed; no partial restore was kept.",
      "error",
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error &&
          /^(Choose |Invalid |Unsupported |This backup|Storage migration)/.test(
            error.message,
          )
            ? error.message
            : "Could not restore that backup. Check the file and storage connection.",
      },
      { status: 400 },
    );
  }
}
