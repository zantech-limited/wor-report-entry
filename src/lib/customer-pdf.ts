import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import {
  SIGNATURE_MARKS,
  type CustomerSnapshot,
  type Signature,
} from "./field-model";
import { readFormLayout } from "./form-layout-store";
import {
  fieldsForLayout,
  formValue,
  formChoices,
  choiceSelected,
  FORM_WIDTH,
  FORM_HEIGHT,
} from "./form-layout";
const regularFontBytes = readFileSync(
  `${process.cwd()}/templates/fonts/NotoSans-Regular.ttf`,
);
const boldFontBytes = readFileSync(
  `${process.cwd()}/templates/fonts/NotoSans-Bold.ttf`,
);
const backgroundBytes = readFileSync(
  `${process.cwd()}/public/work-order-template.png`,
);
export async function customerPdf(
  snapshot: CustomerSnapshot,
  { approved = false }: { approved?: boolean } = {},
) {
  const { layout } = await readFormLayout();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regularFontBytes, { subset: true });
  const bold = await doc.embedFont(boldFontBytes, { subset: true });
  const background = await doc.embedPng(backgroundBytes);
  const scale = 595.28 / FORM_WIDTH,
    height = FORM_HEIGHT * scale;
  const page = doc.addPage([595.28, height]);
  page.drawImage(background, { x: 0, y: 0, width: 595.28, height });
  page.drawRectangle({
    x: 901 * scale,
    y: height - 129 * scale,
    width: 132 * scale,
    height: 43 * scale,
    color: rgb(1, 1, 1),
  });
  function printable(face: typeof font, value: string) {
    let text = "";
    for (const char of value) {
      try {
        face.encodeText(char);
        text += char;
      } catch {
        text += " ";
      }
    }
    return text;
  }
  function draw(
    p: PDFPage,
    text: string,
    x: number,
    y: number,
    size: number,
    strong = false,
    red = false,
  ) {
    const face = strong ? bold : font;
    const safe = printable(face, text);
    if (!safe.trim()) return;
    p.drawText(safe, {
      x: x * scale,
      y: p.getHeight() - y * scale,
      size: size * scale,
      font: face,
      color: red ? rgb(0.86, 0.15, 0.15) : rgb(0.08, 0.08, 0.08),
    });
  }
  function wrap(value: string, width: number, size: number, strong = false) {
    const face = strong ? bold : font;
    const rows: string[] = [];
    for (const paragraph of printable(face, value)
      .replace(/[\u0000-\u0008\u000b-\u001f]/g, "")
      .split(/\r?\n/)) {
      let row = "";
      for (const char of paragraph) {
        if (
          (strong ? bold : font).widthOfTextAtSize(row + char, size) > width &&
          row
        ) {
          rows.push(row);
          row = "";
        }
        row += char;
      }
      rows.push(row);
    }
    return rows;
  }
  const overflow: { label: string; rows: string[] }[] = [];
  for (const field of fieldsForLayout(layout)) {
    const size = field.size || 16,
      leading = field.leading || 21,
      strong = field.key === "wor" || field.source === "notice",
      rows = wrap(formValue(snapshot, field), field.w, size, strong),
      capacity = Math.max(1, Math.floor((field.h - size) / leading) + 1);
    rows
      .slice(0, capacity)
      .forEach((row, i) =>
        draw(
          page,
          row,
          field.x,
          field.y + size + i * leading,
          size,
          strong,
          field.key === "wor",
        ),
      );
    if (rows.length > capacity)
      overflow.push({ label: field.label, rows: rows.slice(capacity) });
  }
  if (!approved) draw(page, "DRAFT - NOT CUSTOMER APPROVED", 78, 140, 12);
  for (const choice of formChoices)
    if (choiceSelected(snapshot, choice.label))
      page.drawEllipse({
        x: (choice.x + choice.w / 2) * scale,
        y: height - (choice.y + 11) * scale,
        xScale: (choice.w / 2 + 4) * scale,
        yScale: 14 * scale,
        borderColor: rgb(0.86, 0.08, 0.08),
        borderWidth: 1.1,
      });
  function signature(
    value: Signature | null,
    box: { x: number; y: number; w: number; h: number },
  ) {
    if (!value) return;
    for (const stroke of value.strokes)
      for (let i = 1; i < stroke.length; i++)
        page.drawLine({
          start: {
            x: (box.x + stroke[i - 1][0] * box.w) * scale,
            y: height - (box.y + stroke[i - 1][1] * box.h) * scale,
          },
          end: {
            x: (box.x + stroke[i][0] * box.w) * scale,
            y: height - (box.y + stroke[i][1] * box.h) * scale,
          },
          thickness: 1.35,
          color: rgb(0, 0, 0),
        });
  }
  for (const mark of SIGNATURE_MARKS) signature(snapshot[mark.key], mark);
  let extra: PDFPage | undefined,
    y = 0;
  function continuation() {
    extra = doc.addPage([595.28, height]);
    draw(
      extra,
      `Work Order Request ${snapshot.line.wor} - continued`,
      78,
      90,
      22,
    );
    if (!approved) draw(extra, "DRAFT - NOT CUSTOMER APPROVED", 78, 122, 12);
    y = 170;
  }
  for (const section of overflow) {
    if (!extra || y > 1250) continuation();
    draw(extra!, section.label + " (continued)", 78, y, 18);
    y += 32;
    for (const row of section.rows) {
      if (y > 1320) continuation();
      draw(extra!, row, 78, y, 16);
      y += 24;
    }
    y += 24;
  }
  doc
    .getPages()
    .forEach((p, i) =>
      draw(
        p,
        `Zantech Limited | ${i + 1} / ${doc.getPageCount()}`,
        78,
        1400,
        11,
      ),
    );
  doc.setTitle(`Work Order Request ${snapshot.line.wor}`);
  doc.setAuthor("Zantech Limited");
  return Buffer.from(await doc.save());
}
