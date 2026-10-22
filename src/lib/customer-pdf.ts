import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import type { CustomerSnapshot, Signature } from "./field-model";
import { crewNames } from "./crew";
import { nameKey } from "./model";
import { formatCopycount } from "./copycount";

export async function customerPdf(
  snapshot: CustomerSnapshot,
  { approved = false }: { approved?: boolean } = {},
) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
      readFileSync(`${process.cwd()}/templates/fonts/NotoSans-Regular.ttf`),
      { subset: true },
    ),
    bold = await doc.embedFont(
      readFileSync(`${process.cwd()}/templates/fonts/NotoSans-Bold.ttf`),
      { subset: true },
    );
  const { line, fields } = snapshot,
    black = rgb(0.08, 0.08, 0.08),
    gray = rgb(0.86, 0.86, 0.86),
    red = rgb(0.75, 0.08, 0.08),
    left = 36,
    right = 559,
    width = 523;
  const noCharge = nameKey(line.paymentMethod) === "no charge";
  function text(
    p: PDFPage,
    value: string,
    x: number,
    y: number,
    size = 8,
    strong = false,
    color = black,
  ) {
    p.drawText(value.normalize("NFC").replace(/[\u0000-\u001f]/g, " "), {
      x,
      y,
      size,
      font: strong ? bold : font,
      color,
    });
  }
  function wrap(value: string, max: number, size = 8) {
    const result: string[] = [];
    for (const paragraph of value.split(/\r?\n/)) {
      let row = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(word, size) > max) {
          if (row) {
            result.push(row);
            row = "";
          }
          for (const char of word) {
            if (font.widthOfTextAtSize(row + char, size) > max && row) {
              result.push(row);
              row = "";
            }
            row += char;
          }
        } else if (
          row &&
          font.widthOfTextAtSize(row + " " + word, size) > max
        ) {
          result.push(row);
          row = word;
        } else row = row ? row + " " + word : word;
      }
      result.push(row);
    }
    return result;
  }
  function header(p: PDFPage, continued = false) {
    text(p, "ZANTECH", left, 800, 17, true, rgb(0.5, 0.07, 0.07));
    text(p, "34 Richmond Street, Port of Spain, Trinidad, W.I.", left, 785, 6);
    text(
      p,
      "Tel: (868) 623-1041 / 626-2284  |  sales@zantechtt.com",
      left,
      775,
      6,
    );
    text(
      p,
      continued ? "Work Order Request - continued" : "Work Order Request",
      230,
      798,
      14,
      true,
    );
    text(p, "Req. No.", 416, 813, 8, true);
    if (noCharge) text(p, "NO CHARGE", 416, 799, 10, true);
    const request = line.wor || line.id;
    const size = Math.min(
      12,
      139 / Math.max(1, bold.widthOfTextAtSize(request, 1)),
    );
    text(p, request, 416, 782, size, true, red);
    if (!approved)
      text(p, "DRAFT - NOT CUSTOMER APPROVED", left, 733, 7, true, red);
  }
  const overflow: { label: string; lines: string[] }[] = [];
  function band(p: PDFPage, label: string, top: number, x = left, w = width) {
    p.drawRectangle({
      x,
      y: top - 15,
      width: w,
      height: 15,
      color: gray,
      borderColor: black,
      borderWidth: 0.6,
    });
    text(p, label, x + 4, top - 11, 9, true);
  }
  function cell(
    p: PDFPage,
    label: string,
    value: string,
    x: number,
    top: number,
    w: number,
    h: number,
    size = 8,
  ) {
    p.drawRectangle({
      x,
      y: top - h,
      width: w,
      height: h,
      borderColor: black,
      borderWidth: 0.6,
    });
    text(p, label, x + 4, top - 11, 8, true);
    const rows = wrap(value, w - 10, size),
      capacity = Math.max(1, Math.floor((h - 19) / 11));
    rows
      .slice(0, capacity)
      .forEach((row, i) => text(p, row, x + 4, top - 23 - i * 11, size));
    if (rows.length > capacity)
      overflow.push({ label, lines: rows.slice(capacity) });
  }
  const p = doc.addPage([595.28, 841.89]);
  header(p);
  band(p, "Client Worksite Details", 720);
  cell(p, "Client Name", line.customer, left, 705, width / 2, 46);
  cell(
    p,
    "Client Address",
    fields.clientAddress || line.location,
    left + width / 2,
    705,
    width / 2,
    46,
  );
  band(p, "Order Details", 651);
  const labels = ["Date Schedule", "Phone No.", "Requester Name", "Email"],
    values = [
      fields.scheduledDate,
      fields.phone,
      fields.requesterName,
      fields.requesterEmail,
    ];
  labels.forEach((label, i) =>
    cell(p, label, values[i], left + (i * width) / 4, 636, width / 4, 37, 7),
  );
  cell(p, "Tech. Name", crewNames(line).join(", "), left, 599, width / 2, 48);
  cell(
    p,
    "Description of Work Required",
    fields.workRequired,
    left + width / 2,
    599,
    width / 2,
    48,
  );
  band(p, "Details of Work Carried Out", 542);
  const workRows = wrap(fields.workCarriedOut, width - 10, 9);
  for (let i = 0; i < 8; i++) {
    const y = 516 - i * 13;
    p.drawLine({
      start: { x: left, y: y - 2 },
      end: { x: right, y: y - 2 },
      thickness: 0.4,
      dashArray: [1, 2],
      color: black,
    });
    if (workRows[i]) text(p, workRows[i], left + 3, y, 9);
  }
  if (workRows.length > 8)
    overflow.push({
      label: "Details of Work Carried Out",
      lines: workRows.slice(8),
    });
  band(p, "Material Used", 410, left, width / 2);
  band(p, "Equipment Used", 410, left + width / 2, width / 2);
  cell(
    p,
    "Part / description / quantity",
    [line.partNo, line.description, line.qty].filter(Boolean).join("\n"),
    left,
    395,
    width / 2,
    93,
  );
  cell(
    p,
    "Model / Serial / Copy count",
    [line.modelNo, line.serialNo, formatCopycount(line.copycount)]
      .filter(Boolean)
      .join("\n"),
    left + width / 2,
    395,
    width / 2,
    54,
  );
  p.drawRectangle({
    x: left + width / 2,
    y: 302,
    width: width / 2,
    height: 39,
    borderColor: black,
    borderWidth: 0.6,
  });
  const choices = [
    "Rental",
    "ServMaint",
    "Charge",
    "Cash",
    "PM",
    "Gold",
    "Silver",
    "Bronze",
  ];
  choices.forEach((label, i) => {
    const x = left + width / 2 + 10 + (i % 4) * 61,
      y = 328 - Math.floor(i / 4) * 19;
    text(p, label, x, y, 7);
    const selected =
      !noCharge &&
      (nameKey(line.slaType) === nameKey(label) ||
        nameKey(line.paymentMethod) === nameKey(label) ||
        (label === "PM" && line.serviceType === "PM") ||
        (label === "Charge" &&
          Number(line.revenue.replace(/[$,]/g, "")) !== 0 &&
          nameKey(line.paymentMethod) !== "cash"));
    if (selected)
      p.drawEllipse({
        x: x + font.widthOfTextAtSize(label, 7) / 2,
        y: y + 2.5,
        xScale: font.widthOfTextAtSize(label, 7) / 2 + 5,
        yScale: 7,
        borderColor: black,
        borderWidth: 1,
      });
  });
  band(p, "Other Work Performed", 292, left, width / 2);
  band(p, "Other Work Needed", 292, left + width / 2, width / 2);
  cell(p, "", fields.otherPerformed, left, 277, width / 2, 46);
  cell(p, "", fields.otherNeeded, left + width / 2, 277, width / 2, 46);
  band(p, "Completion Information", 221);
  ["Date Started", "Time Started", "Date Completed", "Time Completed"].forEach(
    (label, i) =>
      cell(
        p,
        label,
        [
          fields.startedDate,
          line.arrivalTime,
          fields.completedDate,
          line.departureTime,
        ][i],
        left + (i * width) / 4,
        206,
        width / 4,
        34,
      ),
  );
  function signature(
    value: Signature | null,
    x: number,
    top: number,
    w: number,
    h: number,
  ) {
    if (!value) return;
    for (const stroke of value.strokes)
      for (let i = 1; i < stroke.length; i++)
        p.drawLine({
          start: { x: x + stroke[i - 1][0] * w, y: top - stroke[i - 1][1] * h },
          end: { x: x + stroke[i][0] * w, y: top - stroke[i][1] * h },
          thickness: 1,
          color: black,
        });
  }
  function signoff(
    label: string,
    name: string,
    designation: string,
    date: string,
    value: Signature | null,
    top: number,
  ) {
    text(p, label, left, top, 8, true);
    const baseline = top - 36;
    p.drawLine({
      start: { x: left + 73, y: baseline },
      end: { x: right, y: baseline },
      thickness: 0.5,
      dashArray: [1, 2],
      color: black,
    });
    const nameRows = wrap(name, 143, 7);
    text(p, nameRows[0] || "", left + 77, baseline + 7, 7);
    if (nameRows.length > 1)
      overflow.push({ label: label + " name", lines: wrap(name, width - 10) });
    signature(value, left + 230, top - 5, 105, 29);
    const designationRows = wrap(designation, 90, 7);
    text(p, designationRows[0] || "", left + 350, baseline + 7, 7);
    if (designationRows.length > 1)
      overflow.push({
        label: label + " designation",
        lines: wrap(designation, width - 10),
      });
    text(p, date, left + 451, baseline + 7, 7);
    text(p, "Print Name", left + 80, baseline - 11, 6);
    text(p, "Signature", left + 250, baseline - 11, 6);
    text(p, "Designation", left + 350, baseline - 11, 6);
    text(p, "Date", left + 455, baseline - 11, 6);
  }
  signoff(
    "COMPLETED BY:",
    fields.completedByName,
    fields.completedByDesignation,
    fields.completedDate,
    snapshot.technicianSignature,
    157,
  );
  signoff(
    "APPROVED BY:",
    fields.approvedByName,
    fields.approvedByDesignation,
    fields.approvedDate,
    snapshot.signature,
    91,
  );
  let extra: PDFPage | undefined,
    y = 0;
  for (const section of overflow) {
    for (const [index, row] of section.lines.entries()) {
      if (!extra || y < 60) {
        extra = doc.addPage([595.28, 841.89]);
        header(extra, true);
        y = 710;
      }
      if (index === 0) {
        text(extra, section.label + " (continued)", left, y, 10, true);
        y -= 18;
      }
      const segments = wrap(row, width - 10, 9);
      for (const segment of segments) {
        if (y < 50) {
          extra = doc.addPage([595.28, 841.89]);
          header(extra, true);
          y = 710;
        }
        text(extra, segment, left + 3, y, 9);
        y -= 13;
      }
    }
    y -= 15;
  }
  doc.getPages().forEach((page, i) => {
    text(
      page,
      `Zantech Limited | ${i + 1} / ${doc.getPageCount()}`,
      left,
      19,
      6,
    );
  });
  doc.setTitle(`Work Order Request ${line.wor}`);
  doc.setAuthor("Zantech Limited");
  return Buffer.from(await doc.save());
}
