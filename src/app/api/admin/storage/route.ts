import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  Storage,
  validateConfig,
  readConfig,
  database,
  assertWritable,
} from "@/lib/storage";
import { migrateStorage } from "@/lib/backups";
import { logEvent } from "@/lib/events";
import { verifyDatabaseIdentifier } from "@/lib/database-identity";
import { connectExistingStorage } from "@/lib/shared-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    assertWritable();
    const body = await request.json();
    const existing = readConfig();
    const config = validateConfig({
      ...body.config,
      password:
        body.keepPassword &&
        body.config.engine === existing.engine &&
        body.config.host === existing.host &&
        body.config.database === existing.database &&
        body.config.username === existing.username
          ? existing.password
          : body.config.password,
    });
    if (body.action === "test") {
      if (config.engine === "sqlite") {
        await (await database()).query("SELECT 1 AS ok");
      } else {
        const test = new Storage(config);
        try {
          await test.query("SELECT 1 AS ok");
          if(config.databaseCode) await verifyDatabaseIdentifier(test,config.databaseCode);
        } finally {
          await test.close();
        }
      }
      logEvent("storage.test", `Connection to ${config.engine} succeeded.`);
      return NextResponse.json({
        message: "Connection succeeded. No report data was changed.",
      });
    }
    if (process.env.DB_ENGINE)
      throw new Error(
        "Storage is controlled by environment variables. Update those settings and restart after migrating with a backup.",
      );
    if (body.action === "migrate") {
      const result = await migrateStorage(config);
      return NextResponse.json({
        message: `${result.reports} months verified and copied. Restart the service desk to activate ${config.engine}. Writes are paused until restart.`,
        ...result,
      });
    }
    if (body.action === "connect") {
      const code=await connectExistingStorage(config);
      logEvent('storage.connected','Verified shared database connection. Restart required.');
      return NextResponse.json({message:`Shared database ${code} verified. Restart this container to use it. Local data was not copied or removed; writes are paused until restart.`});
    }
    throw new Error("Use Test connection or Copy data and switch on restart.");
  } catch (error) {
    // Driver errors may contain credentials or connection details; never return them.
    logEvent("storage.error", "A storage operation failed.", "error");
    const message =
      error instanceof Error &&
      /^(The destination|Migration verification|To return|Storage |Use Test|Host,|Port |Choose |Invalid |Enter |Database identifier|Shared connection|Supabase requires)/.test(
        error.message,
      )
        ? error.message
        : "Connection or migration failed. Check the database, credentials, TLS, permissions, and server availability.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
