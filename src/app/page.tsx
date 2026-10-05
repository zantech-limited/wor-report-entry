import { ReportHome } from "@/components/report-home";
import { listReports } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const reports = await listReports();
  return <ReportHome reports={reports} />;
}
