import { filenameFromDisposition } from "./pdf-name";

export type SavePdfResult = "saved" | "shared" | "cancelled" | "needs-gesture";

function isIos() {
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function installedApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Fetch a PDF from an already-authorized route and keep the server's filename. */
export async function fetchPdfFile(url: string): Promise<File> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    let message = "Could not download the PDF.";
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) message = body.error;
    } catch {
      /* The route reports errors as JSON; a non-JSON failure uses the fallback. */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("Could not download the PDF.");
  const name = filenameFromDisposition(response.headers.get("Content-Disposition"));
  const filename = name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
  return new File([blob], filename, { type: "application/pdf" });
}

function anchorDownload(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Save a PDF that is already in memory.
 * iOS and installed iOS PWAs ignore a normal download, so the share sheet
 * (Save to Files) is used there. Call this directly from the click when the
 * file is ready so the share sheet keeps the user gesture.
 */
export async function savePdfFile(file: File): Promise<SavePdfResult> {
  if (
    (isIos() || installedApp()) &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: file.name.replace(/\.pdf$/i, ""),
      });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        return "cancelled";
      if (error instanceof DOMException && error.name === "NotAllowedError")
        return "needs-gesture";
    }
  }
  anchorDownload(file);
  return "saved";
}
