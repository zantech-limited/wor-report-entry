"use client";
import { useState } from "react";
import { customerSnapshot, type FieldJob } from "@/lib/field-model";
import { fetchPdfFile, savePdfFile } from "@/lib/save-pdf";
import { Button } from "./ui/button";

export function DownloadPdfButton({
  url,
  file,
  job,
  disabled = false,
  disabledReason,
}: {
  url?: string;
  file?: File;
  /** Open form. When set, the PDF is drawn from this copy, including unsynced signatures. */
  job?: FieldJob;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<File>();
  const [note, setNote] = useState("");
  const prepared = file || ready;

  async function onClick() {
    if (prepared) {
      const result = await savePdfFile(prepared);
      if (result === "cancelled") return;
      if (result === "needs-gesture") {
        setReady(prepared);
        setNote("PDF ready. Tap Save PDF.");
        return;
      }
      setReady(undefined);
      setNote(
        result === "shared"
          ? "Use the share sheet to save the PDF."
          : "PDF downloaded.",
      );
      return;
    }
    if (!url) return;
    if (!navigator.onLine) {
      setNote("Connect to download the PDF.");
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const downloaded = await fetchPdfFile(
        url,
        job ? { snapshot: customerSnapshot(job) } : undefined,
      );
      const result = await savePdfFile(downloaded);
      if (result === "needs-gesture") {
        setReady(downloaded);
        setNote("PDF ready. Tap Save PDF.");
      } else if (result !== "cancelled") {
        setNote(
          result === "shared"
            ? "Use the share sheet to save the PDF."
            : "PDF downloaded.",
        );
      }
    } catch (error) {
      setNote(
        error instanceof Error ? error.message : "Could not download the PDF.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || busy || (!url && !prepared)}
        onClick={() => void onClick()}
      >
        {busy ? "Preparing PDF…" : prepared && !file ? "Save PDF" : "Download PDF"}
      </Button>
      {disabled && disabledReason && (
        <p className="max-w-xs text-xs text-muted-foreground">{disabledReason}</p>
      )}
      {note && (
        <p role="status" className="max-w-xs text-xs">
          {note}
        </p>
      )}
    </div>
  );
}
