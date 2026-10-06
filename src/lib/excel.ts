import JSZip from "jszip";
import {
  blankLine,
  isBlankLine,
  type PrefixEntry,
  type Report,
  type WorkOrder,
} from "./model";

export type DirectoryCounts = {
  customers: Map<string, number>;
  locations: Map<string, Map<string, number>>;
  techs: Map<string, number>;
};

export type ParsedWorkbook = {
  title: string;
  preparedBy: string;
  lines: WorkOrder[];
  prefixMap: PrefixEntry[];
  directory: DirectoryCounts;
  headerRow: number;
  columns: Partial<Record<ColumnKey, string>>;
};

type Cell = {
  value: string | null;
  style: string | null;
};

type SheetRow = {
  r: number;
  cells: Record<string, Cell>;
};

const COLUMN_HEADERS = {
  no: "No.",
  wor: "WOR",
  date: "Date",
  customer: "Customer",
  location: "Location",
  serviceType: "Service Type",
  slaType: "SLA Type",
  modelNo: "Model No.",
  serialNo: "Serial No.",
  copycount: "Copycount",
  technician: "Technician Assigned",
  secondaryTech: "Secondary Tech",
  arrivalTime: "Arrival Time",
  departureTime: "Departure Time",
  timeTaken: "Time Taken",
  partsRequired: "Parts Required",
  partNo: "Part  No.",
  description: "Description",
  qty: "QTY",
  iro: "IRO",
  paymentMethod: "Payment Method",
  revenue: "Revenue ($)",
  jobStatus: "Job Status",
  ftf: "FTF",
  comments: "Comments",
} as const;

type ColumnKey = keyof typeof COLUMN_HEADERS;

const PART_NO_ALIASES = ["Part  No.", "Part No."];

const TIME_FORMULA =
  "(Table2[[#This Row],[Departure Time]] - Table2[[#This Row],[Arrival Time]] + (Table2[[#This Row],[Departure Time]] &lt; Table2[[#This Row],[Arrival Time]])) * 24";

const DEFAULT_STYLES: Partial<Record<ColumnKey, string>> = {
  no: "4",
  wor: "4",
  date: "3",
  customer: "1",
  location: "1",
  copycount: "8",
  arrivalTime: "2",
  departureTime: "2",
  timeTaken: "19",
  partNo: "1",
  description: "1",
  qty: "23",
  iro: "1",
  revenue: "7",
  jobStatus: "1",
  ftf: "1",
  comments: "1",
};

const LIST_VALIDATIONS: { keys: ColumnKey[]; formula: string }[] = [
  {
    keys: ["serviceType"],
    formula:
      '"PM,Per Call,Install,Re-visit,Warranty,Assessment,Courtesy,Discovery,Issue,Service,PFS,Delivery,Training,Internal"',
  },
  {
    keys: ["slaType"],
    formula: '"Gold,Silver,Bronze,Rental,N/A,ServMaint"',
  },
  {
    keys: ["technician", "secondaryTech"],
    formula:
      '"Ainsley,Garvin,Herman,Jessica,Joel,Kyle,Nafees,Timothy,Kevin,Reggie,Andre"',
  },
  { keys: ["partsRequired"], formula: '"Yes,No"' },
  {
    keys: ["paymentMethod"],
    formula: '"No charge,Cash,PO,Cheque,Online,Showroom"',
  },
  {
    keys: ["jobStatus"],
    formula: '"In Progress,Awaiting Parts,Customer rescheduled,Completed"',
  },
  { keys: ["ftf"], formula: '"Yes,No,N/A"' },
];

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, digits: string) =>
      String.fromCodePoint(Number(digits)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/_x000[dD]_/g, "");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    out[match[1]] = match[2];
  }
  return out;
}

function sharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(
      (part) => decodeXml(part[1]),
    );
    strings.push(parts.join(""));
  }
  return strings;
}

function parseRows(xml: string, strings: string[]): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const match of xml.matchAll(
    /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g,
  )) {
    const rowAttrs = attrs(match[1]);
    const r = Number(rowAttrs.r ?? "0");
    const cells: Record<string, Cell> = {};
    const inner = match[2] ?? "";
    for (const cellMatch of inner.matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const cellAttrs = attrs(cellMatch[1]);
      const ref = cellAttrs.r ?? "";
      const col = ref.replace(/[0-9]/g, "");
      const body = cellMatch[2] ?? "";
      let value: string | null = null;
      const inline = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
      const raw = body.match(/<v>([\s\S]*?)<\/v>/);
      if (cellAttrs.t === "s" && raw?.[1] != null) {
        value = strings[Number(raw[1])] ?? "";
      } else if (cellAttrs.t === "inlineStr" && inline?.[1] != null) {
        value = decodeXml(inline[1]);
      } else if (cellAttrs.t === "e") {
        value = null;
      } else if (raw?.[1] != null) {
        value = decodeXml(raw[1]);
      }
      cells[col] = { value, style: cellAttrs.s ?? null };
    }
    rows.push({ r, cells });
  }
  return rows;
}

function sheetPaths(workbookXml: string, relsXml: string): Map<string, string> {
  const rels = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const rel = attrs(match[1]);
    if (!rel.Id || !rel.Target) continue;
    const target = rel.Target.startsWith("/")
      ? rel.Target.slice(1)
      : `xl/${rel.Target.replace(/^\.\.\//, "")}`;
    rels.set(rel.Id, target);
  }
  const sheets = new Map<string, string>();
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const sheet = attrs(match[1]);
    const rid = sheet["r:id"];
    const target = rid ? rels.get(rid) : undefined;
    if (sheet.name && target) sheets.set(sheet.name, target);
  }
  return sheets;
}

function headerMap(row: SheetRow): Partial<Record<ColumnKey, string>> {
  const byText = new Map<string, string>();
  for (const [col, cell] of Object.entries(row.cells)) {
    if (cell.value) byText.set(cell.value.trim(), col);
  }
  const columns: Partial<Record<ColumnKey, string>> = {};
  for (const [key, header] of Object.entries(COLUMN_HEADERS) as [
    ColumnKey,
    string,
  ][]) {
    if (key === "partNo") {
      const found = PART_NO_ALIASES.map((name) => byText.get(name)).find(Boolean);
      if (found) columns.partNo = found;
      continue;
    }
    const col = byText.get(header);
    if (col) columns[key] = col;
  }
  return columns;
}

function findHeader(rows: SheetRow[]): {
  row: SheetRow;
  columns: Partial<Record<ColumnKey, string>>;
} | null {
  for (const row of rows) {
    const columns = headerMap(row);
    if (columns.customer && (columns.serialNo || columns.location || columns.technician)) {
      return { row, columns };
    }
  }
  return null;
}

function cellText(row: SheetRow, col: string | undefined): string {
  if (!col) return "";
  return (row.cells[col]?.value ?? "").trim();
}

function excelDateToIso(raw: string): string {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const serial = Number(raw);
  if (!Number.isFinite(serial)) return "";
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function excelTimeToHhmm(raw: string): string {
  if (!raw) return "";
  const clock = raw.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (clock) {
    let hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const ampm = clock[3]?.toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  const serial = Number(raw);
  if (!Number.isFinite(serial)) return "";
  const total = Math.round((serial % 1) * 1440);
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isoToExcel(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000);
}

function hhmmToExcel(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours * 60 + minutes) / 1440;
}

function numeric(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function emptyDirectory(): DirectoryCounts {
  return { customers: new Map(), locations: new Map(), techs: new Map() };
}

function bump(map: Map<string, number>, key: string) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function lineFromRow(
  row: SheetRow,
  columns: Partial<Record<ColumnKey, string>>,
): WorkOrder {
  const text = (key: ColumnKey) => cellText(row, columns[key]);
  const line = blankLine(text("no"));
  line.wor = text("wor");
  line.date = excelDateToIso(text("date"));
  line.customer = text("customer");
  line.location = text("location");
  line.serviceType = text("serviceType");
  line.slaType = text("slaType");
  line.modelNo = text("modelNo");
  line.serialNo = text("serialNo");
  line.copycount = text("copycount");
  line.technician = text("technician");
  line.secondaryTech = text("secondaryTech");
  line.arrivalTime = excelTimeToHhmm(text("arrivalTime"));
  line.departureTime = excelTimeToHhmm(text("departureTime"));
  line.partsRequired = text("partsRequired");
  line.partNo = text("partNo");
  line.description = text("description");
  line.qty = text("qty");
  line.iro = text("iro");
  line.paymentMethod = text("paymentMethod");
  line.revenue = text("revenue");
  line.jobStatus = text("jobStatus");
  line.ftf = text("ftf");
  line.comments = text("comments");
  return line;
}

function absorbDirectory(
  directory: DirectoryCounts,
  rows: SheetRow[],
  header: { row: SheetRow; columns: Partial<Record<ColumnKey, string>> },
) {
  for (const row of rows) {
    if (row.r <= header.row.r) continue;
    const customer = cellText(row, header.columns.customer);
    const location = cellText(row, header.columns.location);
    const technician = cellText(row, header.columns.technician);
    const secondary = cellText(row, header.columns.secondaryTech);
    if (customer) {
      bump(directory.customers, customer);
      if (location) {
        const sites = directory.locations.get(customer) ?? new Map();
        bump(sites, location);
        directory.locations.set(customer, sites);
      }
    }
    bump(directory.techs, technician);
    bump(directory.techs, secondary);
  }
}

function preparedByFrom(rows: SheetRow[]): { value: string; ref: string | null } {
  for (const row of rows) {
    if (row.r > 8) break;
    const cols = Object.keys(row.cells).sort(
      (a, b) => colToNum(a) - colToNum(b),
    );
    for (let i = 0; i < cols.length; i += 1) {
      const value = row.cells[cols[i]]?.value?.trim();
      if (value === "Prepared by:") {
        const next = cols[i + 1];
        return {
          value: next ? (row.cells[next]?.value ?? "").trim() : "",
          ref: next ? `${next}${row.r}` : null,
        };
      }
    }
  }
  return { value: "", ref: null };
}

function titleFrom(rows: SheetRow[]): { value: string; ref: string | null } {
  const row = rows.find((item) => item.r === 2) ?? rows.find((item) => item.r === 1);
  if (!row) return { value: "Monthly Service Report", ref: null };
  const col = Object.keys(row.cells).sort((a, b) => colToNum(a) - colToNum(b))[0];
  const value = col ? (row.cells[col]?.value ?? "").trim() : "";
  return {
    value: value || "Monthly Service Report",
    ref: col ? `${col}${row.r}` : null,
  };
}

export function colToNum(col: string): number {
  let n = 0;
  for (const char of col) n = n * 26 + (char.charCodeAt(0) - 64);
  return n;
}

export function numToCol(n: number): string {
  let value = n;
  let out = "";
  while (value > 0) {
    const mod = (value - 1) % 26;
    out = String.fromCharCode(65 + mod) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

export async function parseWorkbook(data: Buffer | ArrayBuffer | Uint8Array): Promise<ParsedWorkbook> {
  const zip = await JSZip.loadAsync(data);
  const workbookXml = await mustText(zip, "xl/workbook.xml");
  const relsXml = await mustText(zip, "xl/_rels/workbook.xml.rels");
  const stringsXml = zip.file("xl/sharedStrings.xml");
  const strings = stringsXml ? sharedStrings(await stringsXml.async("string")) : [];
  const paths = sheetPaths(workbookXml, relsXml);
  const masterPath = paths.get("Master");
  if (!masterPath || !zip.file(masterPath)) {
    throw new Error("This workbook has no Master sheet.");
  }

  const directory = emptyDirectory();
  let masterRows: SheetRow[] = [];
  let masterHeader: { row: SheetRow; columns: Partial<Record<ColumnKey, string>> } | null =
    null;

  for (const [name, path] of paths) {
    const file = zip.file(path);
    if (!file) continue;
    const rows = parseRows(await file.async("string"), strings);
    const header = findHeader(rows);
    if (!header?.columns.customer) continue;
    absorbDirectory(directory, rows, header);
    if (name === "Master") {
      masterRows = rows;
      masterHeader = header;
    }
  }

  if (!masterHeader?.columns.serialNo || !masterHeader.columns.customer) {
    throw new Error(
      "The Master sheet is missing the service-report columns (Customer, Serial No., and the rest of Table2).",
    );
  }

  const lines = masterRows
    .filter((row) => row.r > masterHeader.row.r)
    .map((row) => lineFromRow(row, masterHeader.columns))
    .filter((line) => !isBlankLine(line));

  const prepared = preparedByFrom(masterRows);
  const title = titleFrom(masterRows);
  const prefixMap = await readPrefixMap(zip, paths.get("PrefixMap"), strings);

  return {
    title: title.value,
    preparedBy: prepared.value,
    lines,
    prefixMap,
    directory,
    headerRow: masterHeader.row.r,
    columns: masterHeader.columns,
  };
}

async function readPrefixMap(
  zip: JSZip,
  path: string | undefined,
  strings: string[],
): Promise<PrefixEntry[]> {
  if (!path || !zip.file(path)) return [];
  const rows = parseRows(await mustText(zip, path), strings);
  const entries: PrefixEntry[] = [];
  for (const row of rows) {
    if (row.r === 1) continue;
    const prefix = (row.cells.A?.value ?? "").trim();
    const model = (row.cells.B?.value ?? "").trim();
    if (!prefix || prefix === "A (Prefix)") continue;
    entries.push({ prefix, model });
  }
  return entries;
}

function styleAt(rows: SheetRow[], ref: string | null): string | null {
  if (!ref) return null;
  const col = ref.replace(/[0-9]/g, "");
  const rowNumber = Number(ref.replace(/[A-Z]/g, ""));
  return rows.find((row) => row.r === rowNumber)?.cells[col]?.style ?? null;
}

function stylesFromSample(
  rows: SheetRow[],
  headerRow: number,
  columns: Partial<Record<ColumnKey, string>>,
): Partial<Record<ColumnKey, string>> {
  const styles = { ...DEFAULT_STYLES };
  const sample = rows.find((row) => row.r > headerRow);
  if (!sample) return styles;
  for (const [key, col] of Object.entries(columns) as [ColumnKey, string][]) {
    const style = sample.cells[col]?.style;
    if (style) styles[key] = style;
  }
  return styles;
}

function inlineCell(ref: string, style: string | undefined, text: string): string {
  const styleAttr = style ? ` s="${style}"` : "";
  if (!text) return `<c r="${ref}"${styleAttr}/>`;
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function numberCell(
  ref: string,
  style: string | undefined,
  value: number | null,
  fallback: string,
): string {
  const styleAttr = style ? ` s="${style}"` : "";
  if (value == null) {
    if (!fallback) return `<c r="${ref}"${styleAttr}/>`;
    return inlineCell(ref, style, fallback);
  }
  return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
}

function dataRowXml(
  line: WorkOrder,
  rowNumber: number,
  columns: Partial<Record<ColumnKey, string>>,
  styles: Partial<Record<ColumnKey, string>>,
): string {
  const cells: string[] = [];
  const put = (key: ColumnKey, xml: string | null) => {
    if (!columns[key] || xml == null) return;
    cells.push(xml);
  };
  const ref = (key: ColumnKey) => `${columns[key]}${rowNumber}`;
  const style = (key: ColumnKey) => styles[key];

  put("no", columns.no ? numberCell(ref("no"), style("no"), numeric(line.no), line.no) : null);
  put("wor", columns.wor ? numberCell(ref("wor"), style("wor"), numeric(line.wor), line.wor) : null);
  put(
    "date",
    columns.date
      ? numberCell(ref("date"), style("date"), isoToExcel(line.date), line.date)
      : null,
  );
  for (const key of [
    "customer",
    "location",
    "serviceType",
    "slaType",
    "modelNo",
    "serialNo",
  ] as const) {
    put(key, columns[key] ? inlineCell(ref(key), style(key), line[key]) : null);
  }
  put(
    "copycount",
    columns.copycount
      ? numberCell(ref("copycount"), style("copycount"), numeric(line.copycount), line.copycount)
      : null,
  );
  put("technician", columns.technician ? inlineCell(ref("technician"), style("technician"), line.technician) : null);
  put(
    "secondaryTech",
    columns.secondaryTech
      ? inlineCell(ref("secondaryTech"), style("secondaryTech"), line.secondaryTech)
      : null,
  );
  put(
    "arrivalTime",
    columns.arrivalTime
      ? numberCell(ref("arrivalTime"), style("arrivalTime"), hhmmToExcel(line.arrivalTime), "")
      : null,
  );
  put(
    "departureTime",
    columns.departureTime
      ? numberCell(
          ref("departureTime"),
          style("departureTime"),
          hhmmToExcel(line.departureTime),
          "",
        )
      : null,
  );
  if (columns.timeTaken) {
    const hours = timeTakenNumber(line);
    const cached = hours == null ? "" : `<v>${hours}</v>`;
    put(
      "timeTaken",
      `<c r="${ref("timeTaken")}"${style("timeTaken") ? ` s="${style("timeTaken")}"` : ""}><f>${TIME_FORMULA}</f>${cached}</c>`,
    );
  }
  for (const key of ["partsRequired", "partNo", "description", "qty", "iro", "paymentMethod"] as const) {
    put(key, columns[key] ? inlineCell(ref(key), style(key), line[key]) : null);
  }
  put(
    "revenue",
    columns.revenue
      ? numberCell(ref("revenue"), style("revenue"), numeric(line.revenue), line.revenue)
      : null,
  );
  for (const key of ["jobStatus", "ftf", "comments"] as const) {
    put(key, columns[key] ? inlineCell(ref(key), style(key), line[key]) : null);
  }

  cells.sort((a, b) => {
    const left = / r="([A-Z]+)/.exec(a)?.[1] ?? "";
    const right = / r="([A-Z]+)/.exec(b)?.[1] ?? "";
    return colToNum(left) - colToNum(right);
  });
  return `<row r="${rowNumber}" spans="1:25" x14ac:dyDescent="0.35">${cells.join("")}</row>`;
}

function timeTakenNumber(line: WorkOrder): number | null {
  const start = hhmmToExcel(line.arrivalTime);
  const end = hhmmToExcel(line.departureTime);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff < 0) diff += 1;
  return diff * 24;
}

function replaceCell(rowXml: string, ref: string, text: string, style: string | null): string {
  const cell = new RegExp(`<c r="${ref}"[^>]*(?:/>|>[\\s\\S]*?</c>)`);
  const styleAttr = style ? ` s="${style}"` : "";
  const next = `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
  if (cell.test(rowXml)) return rowXml.replace(cell, next);
  return rowXml.replace(/<\/row>$/, `${next}</row>`);
}

function validationBlock(
  columns: Partial<Record<ColumnKey, string>>,
  first: number,
  last: number,
): string {
  const rules = LIST_VALIDATIONS.flatMap((rule) => {
    const refs = rule.keys
      .map((key) => columns[key])
      .filter((col): col is string => Boolean(col))
      .map((col) => `${col}${first}:${col}${last}`);
    if (!refs.length) return [];
    return [
      `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${refs.join(" ")}"><formula1>${rule.formula}</formula1></dataValidation>`,
    ];
  });
  return `<dataValidations count="${rules.length}">${rules.join("")}</dataValidations>`;
}

function replaceValidations(xml: string, block: string): string {
  if (/<dataValidations\b[\s\S]*?<\/dataValidations>/.test(xml)) {
    return xml.replace(/<dataValidations\b[\s\S]*?<\/dataValidations>/, block);
  }
  return xml.replace("</worksheet>", `${block}</worksheet>`);
}

async function mustText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`Workbook is missing ${path}.`);
  return file.async("string");
}

export async function writeWorkbook(base: Buffer | Uint8Array, report: Report): Promise<Buffer> {
  const zip = await JSZip.loadAsync(base);
  const workbookXml = await mustText(zip, "xl/workbook.xml");
  const relsXml = await mustText(zip, "xl/_rels/workbook.xml.rels");
  const stringsXml = zip.file("xl/sharedStrings.xml");
  const strings = stringsXml ? sharedStrings(await stringsXml.async("string")) : [];
  const paths = sheetPaths(workbookXml, relsXml);
  const masterPath = paths.get("Master");
  if (!masterPath || !zip.file(masterPath)) {
    throw new Error("Template workbook has no Master sheet.");
  }

  const masterXml = await mustText(zip, masterPath);
  const rows = parseRows(masterXml, strings);
  const header = findHeader(rows);
  if (!header?.columns.serialNo) {
    throw new Error("Template Master sheet is missing Table2 headers.");
  }
  const styles = stylesFromSample(rows, header.row.r, header.columns);
  if (header.columns.copycount) {
    const styleXml = await mustText(zip, "xl/styles.xml");
    const block = styleXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
    if (!block) throw new Error("Workbook is missing cell formatting styles.");
    const formats = [...block[1].matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)].map(match => match[0]);
    const original = formats[Number(styles.copycount ?? 0)];
    if (!original) throw new Error("Copycount formatting style is missing.");
    let grouped = original.replace(/\bnumFmtId="[^"]*"/, 'numFmtId="3"');
    grouped = grouped.replace(/\sapplyNumberFormat="[^"]*"/, '');
    grouped = grouped.replace('<xf ', '<xf applyNumberFormat="1" ');
    const existing = formats.indexOf(grouped);
    styles.copycount = String(existing >= 0 ? existing : formats.length);
    if (existing < 0) {
      const next = block[0].replace(/count="\d+"/, `count="${formats.length + 1}"`).replace('</cellXfs>', `${grouped}</cellXfs>`);
      zip.file("xl/styles.xml", styleXml.replace(block[0], next));
    }
  }
  const prepared = preparedByFrom(rows);
  const title = titleFrom(rows);
  const lines = report.lines.filter((line) => !isBlankLine(line));
  const body = lines.length ? lines : [blankLine("")];
  const lastRow = header.row.r + body.length;

  const sheetDataStart = masterXml.indexOf("<sheetData>");
  const sheetDataEnd = masterXml.indexOf("</sheetData>");
  if (sheetDataStart < 0 || sheetDataEnd < 0) {
    throw new Error("Master sheet has no sheet data.");
  }
  const inner = masterXml.slice(sheetDataStart + "<sheetData>".length, sheetDataEnd);
  const rowXml: string[] = [];
  for (const match of inner.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)) {
    const rowNumber = Number(match[1]);
    if (rowNumber <= header.row.r) rowXml.push(match[0]);
  }
  const preamble = rowXml.map((xml) => {
    let next = xml;
    if (prepared.ref && xml.includes(`r="${prepared.ref}"`)) {
      next = replaceCell(
        next,
        prepared.ref,
        report.preparedBy,
        styleAt(rows, prepared.ref) ?? "10",
      );
    }
    if (title.ref && xml.includes(`r="${title.ref}"`)) {
      next = replaceCell(
        next,
        title.ref,
        report.title || "Monthly Service Report",
        styleAt(rows, title.ref) ?? "32",
      );
    }
    return next;
  });
  const dataXml = body.map((line, index) =>
    dataRowXml(line, header.row.r + 1 + index, header.columns, styles),
  );
  let nextXml =
    masterXml.slice(0, sheetDataStart) +
    `<sheetData>${preamble.join("")}${dataXml.join("")}</sheetData>` +
    masterXml.slice(sheetDataEnd + "</sheetData>".length);

  const lastCol = Object.values(header.columns).sort((a, b) => colToNum(b) - colToNum(a))[0] ?? "Y";
  nextXml = nextXml.replace(
    /<dimension\b[^>]*\/>/,
    `<dimension ref="A1:${lastCol}${lastRow}"/>`,
  );
  nextXml = replaceValidations(
    nextXml,
    validationBlock(header.columns, header.row.r + 1, lastRow),
  );
  zip.file(masterPath, nextXml);

  const relPath = masterPath.replace("worksheets/", "worksheets/_rels/") + ".rels";
  const relFile = zip.file(relPath);
  if (relFile) {
    const relText = await relFile.async("string");
    for (const match of relText.matchAll(/Target="([^"]*table[^"]*)"/g)) {
      const target = match[1];
      const tablePath = target.startsWith("/")
        ? target.slice(1)
        : masterPath.replace(/worksheets\/[^/]+$/, target.replace(/^\.\.\//, ""));
      const normalized = tablePath.startsWith("xl/") ? tablePath : `xl/${tablePath}`;
      const tableFile = zip.file(normalized);
      if (!tableFile) continue;
      let tableXml = await tableFile.async("string");
      if (!/name="Table2"/.test(tableXml) && !/displayName="Table2"/.test(tableXml)) continue;
      tableXml = tableXml.replace(
        /ref="(\$?[A-Z]+)(\d+):(\$?[A-Z]+)(\d+)"/g,
        (_full, c1: string, r1: string, c2: string) => `ref="${c1}${r1}:${c2}${lastRow}"`,
      );
      zip.file(normalized, tableXml);
    }
  }

  const prefixPath = paths.get("PrefixMap");
  if (prefixPath && zip.file(prefixPath)) {
    const prefixXml = await mustText(zip, prefixPath);
    const prefixRows = parseRows(prefixXml, strings);
    const headerXmlMatch = prefixXml.match(/<row\b[^>]*\br="1"[^>]*(?:\/>|>[\s\S]*?<\/row>)/);
    const sampleStyle = prefixRows.find((row) => row.r === 2)?.cells.A?.style ?? "26";
    const headerXml =
      headerXmlMatch?.[0] ??
      `<row r="1" spans="1:2"><c r="A1" t="inlineStr"><is><t>A (Prefix)</t></is></c><c r="B1" t="inlineStr"><is><t>B (Model)</t></is></c></row>`;
    const prefixEntries = report.prefixMap.filter((entry) => entry.prefix.trim());
    const entryXml = prefixEntries.map((entry, index) => {
      const r = index + 2;
      return `<row r="${r}" spans="1:2" x14ac:dyDescent="0.35"><c r="A${r}" s="${sampleStyle}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(entry.prefix)}</t></is></c><c r="B${r}" s="${sampleStyle}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(entry.model)}</t></is></c></row>`;
    });
    const prefixLast = Math.max(1, prefixEntries.length + 1);
    let prefixed = prefixXml.replace(
      /<sheetData>[\s\S]*?<\/sheetData>/,
      `<sheetData>${headerXml}${entryXml.join("")}</sheetData>`,
    );
    prefixed = prefixed.replace(
      /<dimension\b[^>]*\/>/,
      `<dimension ref="A1:B${prefixLast}"/>`,
    );
    zip.file(prefixPath, prefixed);
  }

  zip.remove("xl/calcChain.xml");
  const contentTypes = await mustText(zip, "[Content_Types].xml");
  zip.file(
    "[Content_Types].xml",
    contentTypes.replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, ""),
  );
  const workbookRels = await mustText(zip, "xl/_rels/workbook.xml.rels");
  zip.file(
    "xl/_rels/workbook.xml.rels",
    workbookRels.replace(/<Relationship\b[^>]*\/calcChain"[^>]*\/>/g, ""),
  );

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

export function templatePath(): string {
  return `${process.cwd()}/templates/monthly-service-report.xlsm`;
}
