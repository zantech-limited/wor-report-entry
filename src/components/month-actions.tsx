"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function MonthActions({ quiet = false }: { quiet?: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"import" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createReport() {
    setError(null);
    setPending("create");
    try {
      const response = await fetch("/api/reports", { method: "POST" });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error || "Could not start a new month.");
      router.push(`/?report=${body.id}`);
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not start a new month.";
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
      const body = (await response.json()) as { id?: string; error?: string; lineCount?: number };
      if (!response.ok || !body.id) throw new Error(body.error || "Could not import that workbook.");
      toast.success(body.lineCount ? `Imported ${body.lineCount} work orders.` : "Imported the workbook.");
      router.push(`/?report=${body.id}`);
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
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={quiet ? "outline" : "default"} onClick={createReport} disabled={pending !== null}>
          {pending === "create" ? "Starting…" : "New month"}
        </Button>
        <Button type="button" variant="outline" disabled={pending !== null} onClick={() => fileRef.current?.click()}>
          {pending === "import" ? "Importing…" : "Import workbook"}
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
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
