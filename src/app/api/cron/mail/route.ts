import { timingSafeEqual } from "node:crypto";
import { processMailQueue } from "@/lib/mail-queue";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET,
    provided = request.headers.get("authorization");
  if (
    !expected ||
    !provided ||
    Buffer.byteLength(provided) !== Buffer.byteLength(`Bearer ${expected}`) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(`Bearer ${expected}`))
  )
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  return Response.json({ results: await processMailQueue(2) });
}
