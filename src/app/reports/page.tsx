import {headers} from "next/headers";
import {currentActor} from "@/lib/accounts";
import { ReportBoard } from "@/components/report-board";
import { listWorkEntries } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const entries = await listWorkEntries();
  const actor=await currentActor(new Headers(await headers()));
  return <ReportBoard entries={entries} canExport={actor?.role==="admin"||actor?.role==="manager"} />;
}
