"use client";
import { DownloadPdfButton } from "./download-pdf-button";
import { Button } from "./ui/button";

export function PdfViewer({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PDF viewer"
      className="fixed inset-0 z-[60] flex flex-col bg-background"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <h2 className="text-base font-semibold">Work order PDF</h2>
        <div className="flex flex-wrap gap-2">
          <DownloadPdfButton url={url} />
          <Button type="button" autoFocus onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <iframe
        title="Work order PDF"
        src={url}
        className="min-h-0 w-full flex-1 border-0 bg-neutral-200"
      />
    </div>
  );
}
