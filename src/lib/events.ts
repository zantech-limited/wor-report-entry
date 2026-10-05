import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { dataDirectory } from "./storage";

export type DeskEvent = {
  time: string;
  level: "info" | "error";
  action: string;
  message: string;
};
const logPath = path.join(dataDirectory, "events.jsonl");
export function logEvent(
  action: string,
  message: string,
  level: DeskEvent["level"] = "info",
) {
  try {
    mkdirSync(dataDirectory, { recursive: true });
    if (existsSync(logPath) && statSync(logPath).size > 2 * 1024 * 1024)
      renameSync(logPath, `${logPath}.1`);
    appendFileSync(
      logPath,
      `${JSON.stringify({ time: new Date().toISOString(), level, action, message })}\n`,
      { mode: 0o600 },
    );
  } catch {
    /* Logging must not prevent a work order from saving. */
  }
}
export function recentEvents(): DeskEvent[] {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .slice(-200)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as DeskEvent];
      } catch {
        return [];
      }
    })
    .reverse();
}
