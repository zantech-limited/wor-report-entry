import { readFileSync } from "node:fs";
import { restoreFullSystem } from "../src/lib/backups";
async function main() {
  if (process.env.DESK_RESTORE_EMPTY !== "true" || !process.argv[2])
    throw new Error(
      "Set DESK_RESTORE_EMPTY=true and provide a private backup file. Use a fresh, empty destination database.",
    );
  console.log(
    `Restored ${await restoreFullSystem(JSON.parse(readFileSync(process.argv[2], "utf8")))} workbooks with stable account/work-order identities. Keep the original AUTH_SECRET to decrypt SMTP/device-related server secrets. Sessions must sign in again.`,
  );
  process.exit(0);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Restore failed.");
  process.exit(1);
});
