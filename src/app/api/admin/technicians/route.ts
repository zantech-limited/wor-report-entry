import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listTechnicians, saveTechnician } from "@/lib/technicians";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ technicians: await listTechnicians() });
}
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    await saveTechnician(await request.json());
    return NextResponse.json({ technicians: await listTechnicians() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error &&
          /^(Enter |Invalid |Storage migration)/.test(error.message)
            ? error.message
            : "Could not update technicians.",
      },
      { status: 400 },
    );
  }
}
