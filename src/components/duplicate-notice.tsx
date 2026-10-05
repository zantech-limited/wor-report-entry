"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fileMonthStamp, type Report, type WorkOrder } from "@/lib/model";
import { duplicateKey, duplicateFields, repeatSummary } from "@/lib/duplicates";
type Match = {
  reportId: string;
  lineIndex: number;
  workbook: string;
  customer: string;
  date: string;
  wor: string;
  serialNo: string;
  fields: string[];
};
export function DuplicateNotice({
  report,
  line,
  onOpen,
}: {
  report: Report;
  line: WorkOrder;
  onOpen: (index: number) => void;
}) {
  const [historical, setHistorical] = useState<Match[]>([]);
  const [historicalTotal, setHistoricalTotal] = useState(0);
  const [historicalCounts, setHistoricalCounts] = useState({ wor: 0, serial: 0 });
  useEffect(() => {
    const controller = new AbortController();
    setHistorical([]);
    setHistoricalTotal(0);
    setHistoricalCounts({ wor: 0, serial: 0 });
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        report: report.id,
        wor: line.wor,
        serial: line.serialNo,
      });
      void fetch(`/api/duplicates?${query}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return;
          const data = await response.json();
          setHistorical(data.matches);
          setHistoricalTotal(data.total ?? 0);
          setHistoricalCounts(data.counts ?? {wor: 0, serial: 0});
        })
        .catch(() => {
          /* A notice never blocks entry. */
        });
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [report.id, line.wor, line.serialNo]);
  const wor = duplicateKey(line.wor);
  const serial = duplicateKey(line.serialNo);
  const workbook =
    report.sourceFilename ||
    `Monthly Service Report ${report.preparedBy || "Service desk"} ${fileMonthStamp(report.lines)}.xlsm`;
  const local = report.lines.flatMap((other, index) => {
    if (other.id === line.id) return [];
    const fields = duplicateFields(wor, serial, other);
    return fields.length
      ? [
          {
            reportId: report.id,
            lineIndex: index,
            workbook,
            customer: other.customer,
            date: other.date,
            wor: other.wor,
            serialNo: other.serialNo,
            fields,
          },
        ]
      : [];
  });
  const matches = [...local, ...historical];
  if (!matches.length) return null;
  return (
    <aside
      className="grid gap-2 rounded-xl border bg-accent/50 p-4 text-sm"
      aria-label="Matching work orders"
    >
      <p className="font-medium">
        Matching WOR or serial found in saved workbooks
      </p>
      <p className="font-medium">
        {repeatSummary(local.filter(match => match.fields.includes("WOR")).length + historicalCounts.wor,
          local.filter(match => match.fields.includes("Serial")).length + historicalCounts.serial)}
        {" "}across {local.length + historicalTotal} other work {local.length + historicalTotal === 1 ? "order" : "orders"}.
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        This is a reference notice. Repeated serials may be return visits. The
        No. column is not compared.
      </p>
      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {matches.map((match) => (
          <li
            key={`${match.reportId}-${match.lineIndex}`}
            className="rounded-lg bg-card/70 px-3 py-2"
          >
            <p className="break-words text-xs font-medium">{match.workbook}</p>
            {match.reportId === report.id ? (
              <button
                type="button"
                className="mt-1 text-left text-primary underline underline-offset-2"
                onClick={() => onOpen(match.lineIndex)}
              >
                {match.customer || "No customer"} · {match.date || "Undated"}
              </button>
            ) : (
              <Link
                className="mt-1 inline-block text-primary underline underline-offset-2"
                href={`/?report=${match.reportId}&line=${match.lineIndex}`}
              >
                {match.customer || "No customer"} · {match.date || "Undated"}
              </Link>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {match.fields
                .map(
                  (field) =>
                    `${field}: ${field === "WOR" ? match.wor : match.serialNo}`,
                )
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      {historicalTotal > historical.length && (
        <p className="text-xs text-muted-foreground">
          Showing the first {historical.length} of {historicalTotal} matches in
          other workbooks.
        </p>
      )}
    </aside>
  );
}
