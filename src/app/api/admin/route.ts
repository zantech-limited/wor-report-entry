import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { database, readConfig, writesPaused } from "@/lib/storage";
import { recentEvents } from "@/lib/events";
import { listReports } from "@/lib/db";
import { databaseIdentifier } from "@/lib/database-identity";
import { storageRestartAt } from "@/lib/storage-restart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const config = readConfig();
    const active = (await database()).config;
    return NextResponse.json({
      config: { ...config, password: "", hasPassword: !!config.password },
      activeEngine: active.engine,
      databaseIdentifier: await databaseIdentifier(await database()),
      writesPaused: writesPaused(),
      restartAt: storageRestartAt(),
      events: recentEvents(),
      reportCount: (await listReports()).length,
      environmentConfigured: !!process.env.DB_ENGINE,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Storage is unavailable. Check the connection settings and restart.",
      },
      { status: 503 },
    );
  }
}
