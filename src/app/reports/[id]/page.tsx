import { notFound } from "next/navigation";
import { ReportEditor } from "@/components/report-editor";
import { getReport, getSuggestions } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [report, suggestions] = await Promise.all([getReport(id), getSuggestions()]);
  if (!report) notFound();
  return <ReportEditor initial={report} initialSuggestions={suggestions} />;
}
