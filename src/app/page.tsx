import { ReportEditor } from "@/components/report-editor";
import { ReportHome } from "@/components/report-home";
import { getReport, getSuggestions, listReports } from "@/lib/db";
import { fieldJobIds } from "@/lib/field-jobs";
import { listEntryParts } from "@/lib/parts";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; line?: string }>;
}) {
  const params = await searchParams;
  const reports = await listReports();
  if (!reports.length) return <ReportHome />;
  const requested = params.report && reports.some((item) => item.id === params.report) ? params.report : reports[0].id;
  const [report, suggestions, parts, tracked] = await Promise.all([getReport(requested), getSuggestions(), listEntryParts(), fieldJobIds()]);
  if (!report) return <ReportHome />;
  const requestedLine = Number(params.line ?? 0);
  const line = Number.isFinite(requestedLine) ? Math.min(Math.max(requestedLine, 0), Math.max(report.lines.length - 1, 0)) : 0;
  const fieldIds = new Set(tracked);
  return (
    <ReportEditor
      key={`${report.id}:${line}`}
      initial={report}
      initialSuggestions={suggestions}
      initialIndex={line}
      months={reports}
      initialParts={parts}
      initialFieldLineIds={report.lines.map((row) => row.id).filter((id) => fieldIds.has(id))}
    />
  );
}
