"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ReportSummary } from "@/lib/model";

export function ReportHome({ reports }: { reports: ReportSummary[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"import" | "create" | null>(null);

  async function createReport() {
    setError(null);
    setPending("create");
    try {
      const response = await fetch("/api/reports", { method: "POST" });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        throw new Error(body.error || "Could not start a new report.");
      }
      router.push(`/reports/${body.id}`);
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not start a new report.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  async function importFile(file: File) {
    setError(null);
    setPending("import");
    try {
      const data = new FormData();
      data.set("file", file);
      const response = await fetch("/api/import", { method: "POST", body: data });
      const body = (await response.json()) as {
        id?: string;
        error?: string;
        lineCount?: number;
      };
      if (!response.ok || !body.id) {
        throw new Error(body.error || "Could not import that workbook.");
      }
      toast.success(
        body.lineCount
          ? `Imported ${body.lineCount} work orders.`
          : "Imported the workbook.",
      );
      router.push(`/reports/${body.id}`);
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not import that workbook.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">Service desk</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Monthly service reports</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Enter work orders the way the Master sheet is laid out, then download an
            .xlsm the existing prefix-map macro can still open.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={createReport} disabled={pending !== null}>
            {pending === "create" ? "Starting…" : "New month"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => fileRef.current?.click()}
          >
            {pending === "import" ? "Importing…" : "Import .xlsm"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsm,.xlsx,application/vnd.ms-excel.sheet.macroEnabled.12"
            className="sr-only"
            aria-label="Import a service report workbook"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {reports.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No months saved yet</CardTitle>
            <CardDescription>
              Import the August workbook to bring in its work orders, customers, sites,
              and technicians. Or start a blank month and type the first work order.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Saved reports stay in a local SQLite file on this machine. Nothing here asks you to sign in.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {reports.map((report) => (
            <li key={report.id}>
              <a
                href={`/reports/${report.id}`}
                className="block rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 transition-colors hover:bg-accent"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium">{report.monthLabel}</h2>
                  <Badge variant="secondary">{report.lineCount} work orders</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {report.preparedBy || "No preparer"} · {report.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.sourceFilename ? `Imported from ${report.sourceFilename}` : "Started in the form"}
                  {" · "}
                  Updated{" "}
                  {new Date(report.updatedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
