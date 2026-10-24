const unsafeName = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Filename for a work-order PDF: number, customer, and date when they are known. */
export function workOrderPdfFilename(input: {
  wor?: string;
  customer?: string;
  date?: string;
}): string {
  const pieces = [input.wor, input.customer, input.date]
    .map((value) => (value ?? "").replace(unsafeName, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const base = (pieces.join(" ") || "Work order").slice(0, 140).trim();
  return `${base}.pdf`;
}

export function contentDisposition(filename: string, attachment: boolean): string {
  const safe = filename.replace(/[\r\n]/g, "").trim() || "Work order.pdf";
  const ascii = safe.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${attachment ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export function filenameFromDisposition(header: string | null): string {
  if (!header) return "Work order.pdf";
  const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star) {
    try {
      const name = decodeURIComponent(star[1].trim());
      if (name && !/[\r\n]/.test(name)) return name;
    } catch {
      /* Use the plain filename when the extended name is not encoded. */
    }
  }
  const quoted = /filename="([^"]*)"/.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/.exec(header);
  return plain?.[1]?.trim().replace(/^"|"$/g, "") || "Work order.pdf";
}
