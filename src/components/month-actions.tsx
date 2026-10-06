"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function MonthActions({
  quiet = false,
  beforeLeave,
}: {
  quiet?: boolean;
  beforeLeave?: () => Promise<boolean>;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"import" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [imports, setImports] = useState<{name:string;id?:string;error?:string}[]>([]);

  async function createReport() {
    setError(null);
    setPending("create");
    try {
      if (beforeLeave && !(await beforeLeave())) return;
      const response = await fetch("/api/reports", { method: "POST" });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id)
        throw new Error(body.error || "Could not start a new month.");
      router.push(`/?report=${body.id}`);
      router.refresh();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not start a new month.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  async function importFiles(files: File[]) {
    setError(null);
    setPending("import");
    try {
      if (beforeLeave && !(await beforeLeave())) return;
      const results: {name:string;id?:string;error?:string}[] = [];
      setImports([]);
      for (const [index, file] of files.entries()) {
      setProgress(`Importing ${index + 1} of ${files.length}: ${file.name}`);
      try {
      const data = new FormData();
      data.set("file", file);
      const response = await fetch("/api/import", {
        method: "POST",
        body: data,
      });
      const body = (await response.json()) as {
        id?: string;
        error?: string;
        lineCount?: number;
      };
      if (!response.ok || !body.id)
        throw new Error(body.error || "Could not import that workbook.");
      results.push({name:file.name,id:body.id});
      } catch (cause) {
        results.push({name:file.name,error:cause instanceof Error ? cause.message : "Could not import workbook."});
      }
      setImports([...results]);
      }
      const successes = results.filter(result=>result.id);
      setProgress(`Imported ${successes.length} of ${files.length} workbooks.`);
      if (successes.length) toast.success(`Imported ${successes.length} workbooks.`);
      if (files.length === 1 && successes[0]?.id) {
        router.push(`/?report=${successes[0].id}`);
        router.refresh();
      }
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not import that workbook.";
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
        <Button
          type="button"
          variant={quiet ? "outline" : "default"}
          onClick={createReport}
          disabled={pending !== null}
        >
          {pending === "create" ? "Starting…" : "New month"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending !== null}
          onClick={() => fileRef.current?.click()}
        >
          {pending === "import" ? "Importing…" : "Import workbooks"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".xlsm,.xlsx,application/vnd.ms-excel.sheet.macroEnabled.12"
          className="sr-only"
          tabIndex={-1}
          aria-label="Import a service report workbook"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void importFiles(files);
          }}
        />
      </div>
      {progress && <p role="status" className="text-sm">{progress}</p>}
      {imports.length > 0 && <ul className="space-y-1 text-sm">{imports.map((result,index)=><li key={index}>{result.id ? <Link className="underline" href={`/?report=${result.id}`}>{result.name} — imported</Link> : <span className="text-destructive">{result.name} — {result.error}</span>}</li>)}</ul>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
