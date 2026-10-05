import { ReportBoard } from "@/components/report-board";
import { listWorkEntries } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const entries = await listWorkEntries();
  return <ReportBoard entries={entries} />;
}
