import { database, assertWritable, type Storage } from "./storage";
import { logEvent } from "./events";
import { validateReportInput } from "./report-validation";
import { technicianStates } from "./technicians";
import { rememberParts } from "./parts";
import { workbookMonth } from "./workbook-month";
import { customerSuggestions } from "./customers";
import { parseWorkbook, templatePath, type DirectoryCounts } from "./excel";
import {
  blankLine,
  isBlankLine,
  reportMonthLabel,
  monthLabelFromDate,
  timeTakenHours,
  type MachineRecord,
  type PrefixEntry,
  type Report,
  type ReportSummary,
  type Suggestions,
  type WorkEntry,
  type WorkOrder,
} from "./model";
import { readFileSync } from "node:fs";

type ReportRow = {
  id: string;
  title: string;
  prepared_by: string;
  source_filename: string | null;
  created_at: string;
  updated_at: string;
  prefix_map: string;
  lines: string;
  source_blob: Buffer | null;
};

const globalDb = globalThis as unknown as {
  reportReady?: Promise<void>;
  templatePrefix?: PrefixEntry[];
};

export function whenReady(): Promise<void> {
  if (!globalDb.reportReady) {
    globalDb.reportReady = seedFromTemplate();
    globalDb.reportReady.catch(() => {
      globalDb.reportReady = undefined;
    });
  }
  return globalDb.reportReady;
}

async function seedFromTemplate(): Promise<void> {
  const db = await database();
  const seeded = (await db
    .prepare("SELECT value FROM meta WHERE key = 'seeded'")
    .get()) as { value: string } | undefined;
  const parsed = await parseWorkbook(readFileSync(templatePath()));
  globalDb.templatePrefix = parsed.prefixMap;
  if (!seeded) {
    await seedDirectory(parsed.directory);
    await db
      .prepare("INSERT INTO meta (key, value) VALUES ('seeded', '1')")
      .run();
  }
}

async function seedDirectory(directory: DirectoryCounts) {
  const db = await database();
  const stmt = db.prepare(`
    INSERT INTO suggestions (kind, parent, value, uses)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(kind, parent, value) DO UPDATE SET uses = MAX(uses, excluded.uses)
  `);
  for (const [customer, uses] of directory.customers) {
    await stmt.run("customer", "", customer, uses);
  }
  for (const [customer, sites] of directory.locations) {
    for (const [location, uses] of sites) {
      await stmt.run("location", customer, location, uses);
    }
  }
  for (const [tech, uses] of directory.techs) {
    await stmt.run("tech", "", tech, uses);
  }
}

export async function rememberFromLines(lines: WorkOrder[]) {
  await rememberParts(lines);
  const db = await database();
  const stmt = db.prepare(`
    INSERT INTO suggestions (kind, parent, value, uses)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(kind, parent, value) DO NOTHING
  `);
  for (const line of lines) {
    const customer = line.customer.trim();
    const location = line.location.trim();
    if (customer) await stmt.run("customer", "", customer);
    if (customer && location) await stmt.run("location", customer, location);
    if (line.technician.trim())
      await stmt.run("tech", "", line.technician.trim());
    if (line.secondaryTech.trim())
      await stmt.run("tech", "", line.secondaryTech.trim());
  }
}

export async function getSuggestions(): Promise<Suggestions> {
  await whenReady();
  const db = await database();
  const rows = (await db
    .prepare(
      "SELECT kind, parent, value, uses FROM suggestions ORDER BY uses DESC, LOWER(value) ASC",
    )
    .all()) as { kind: string; parent: string; value: string; uses: number }[];
  const customers: string[] = [];
  const techs: string[] = [];
  const locationsByCustomer: Record<string, string[]> = {};
  for (const row of rows) {
    if (!row.value.trim()) continue;
    if (row.kind === "customer") customers.push(row.value);
    else if (row.kind === "tech") techs.push(row.value);
    else if (row.kind === "location" && row.parent) {
      const list = locationsByCustomer[row.parent] ?? [];
      list.push(row.value);
      locationsByCustomer[row.parent] = list;
    }
  }
  for (const state of await technicianStates()) {
    const found = techs.indexOf(state.name);
    if (!state.active && found >= 0) techs.splice(found, 1);
    else if (state.active && found < 0) techs.push(state.name);
  }
  techs.sort((a, b) => a.localeCompare(b));
  return customerSuggestions({
    customers,
    locationsByCustomer,
    techs,
    machinesByCustomer: await collectMachines(db),
  });
}

async function collectMachines(
  db: Storage,
): Promise<Record<string, MachineRecord[]>> {
  const reports = (await db
    .prepare("SELECT lines FROM reports ORDER BY updated_at ASC")
    .all()) as { lines: string }[];
  const byCustomer = new Map<
    string,
    Map<
      string,
      {
        serialNo: string;
        modelNo: string;
        locations: Set<string>;
        visits: number;
      }
    >
  >();
  for (const report of reports) {
    const lines = JSON.parse(report.lines) as WorkOrder[];
    for (const line of lines) {
      const customer = line.customer.trim();
      const serial = line.serialNo.trim();
      if (!customer || !serial) continue;
      const machines = byCustomer.get(customer) ?? new Map();
      const key = serial.toLowerCase();
      const current = machines.get(key) ?? {
        serialNo: serial,
        modelNo: "",
        locations: new Set<string>(),
        visits: 0,
      };
      current.visits += 1;
      current.serialNo = serial;
      const model = line.modelNo.trim();
      if (model && model !== "Unknown Model") current.modelNo = model;
      const location = line.location.trim();
      current.locations.add(location);
      machines.set(key, current);
      byCustomer.set(customer, machines);
    }
  }
  const result: Record<string, MachineRecord[]> = {};
  for (const [customer, machines] of byCustomer) {
    result[customer] = [...machines.values()]
      .sort(
        (a, b) => b.visits - a.visits || a.serialNo.localeCompare(b.serialNo),
      )
      .map((machine) => ({
        serialNo: machine.serialNo,
        modelNo: machine.modelNo,
        location: machine.locations.size === 1 ? [...machine.locations][0] : "",
      }));
  }
  return result;
}

export async function listWorkEntries(): Promise<WorkEntry[]> {
  await whenReady();
  const rows = (await (
    await database()
  )
    .prepare("SELECT id, lines FROM reports ORDER BY updated_at DESC")
    .all()) as { id: string; lines: string }[];
  const entries: WorkEntry[] = [];
  for (const row of rows) {
    const lines = JSON.parse(row.lines) as WorkOrder[];
    lines.forEach((line, lineIndex) => {
      if (isBlankLine(line)) return;
      const revenue = Number(line.revenue.replace(/[$,]/g, ""));
      entries.push({
        reportId: row.id,
        lineIndex,
        monthLabel: reportMonthLabel([line]),
        date: line.date,
        no: line.no,
        wor: line.wor,
        customer: line.customer,
        location: line.location,
        serviceType: line.serviceType,
        slaType: line.slaType,
        modelNo: line.modelNo,
        serialNo: line.serialNo,
        technician: line.technician,
        secondaryTech: line.secondaryTech,
        hours: timeTakenHours(line.arrivalTime, line.departureTime),
        jobStatus: line.jobStatus,
        revenue:
          Number.isFinite(revenue) && line.revenue.trim() ? revenue : null,
      });
    });
  }
  return entries;
}

function rowToReport(row: ReportRow): Report {
  return {
    id: row.id,
    title: row.title,
    preparedBy: row.prepared_by,
    sourceFilename: row.source_filename,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    prefixMap: JSON.parse(row.prefix_map) as PrefixEntry[],
    lines: JSON.parse(row.lines) as WorkOrder[],
  };
}

function summaryOf(row: ReportRow): ReportSummary {
  const lines = JSON.parse(row.lines) as WorkOrder[];
  return {
    id: row.id,
    title: row.title,
    preparedBy: row.prepared_by,
    sourceFilename: row.source_filename,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lineCount: lines.filter((line) => !isBlankLine(line)).length,
    monthLabel: reportMonthLabel(lines),
  };
}

export async function listReports(): Promise<ReportSummary[]> {
  await whenReady();
  const rows = (await (
    await database()
  )
    .prepare("SELECT * FROM reports ORDER BY updated_at DESC")
    .all()) as ReportRow[];
  const locks=new Map((await (await database()).query("SELECT key, value FROM meta WHERE key LIKE 'report-month:%'"))
    .map(row=>[String(row.key).slice(13),String(row.value)]));
  return rows.map(row=>({...summaryOf(row),...(locks.has(row.id)?{monthLabel:monthLabelFromDate(`${locks.get(row.id)}-01`)}:{})}));
}

export async function getReport(id: string): Promise<Report | null> {
  await whenReady();
  const row = (await (
    await database()
  )
    .prepare("SELECT * FROM reports WHERE id = ?")
    .get(id)) as ReportRow | undefined;
  if(!row) return null;
  const report=rowToReport(row);
  const lock=await (await database()).prepare("SELECT value FROM meta WHERE key = ?").get(`report-month:${id}`);
  report.monthKey=lock ? String(lock.value) : workbookMonth(report.lines);
  return report;
}

export async function getReportBlob(id: string): Promise<Buffer | null> {
  await whenReady();
  const row = (await (
    await database()
  )
    .prepare("SELECT source_blob FROM reports WHERE id = ?")
    .get(id)) as { source_blob: Buffer | null } | undefined;
  if (!row) return null;
  const blob = row.source_blob;
  if (blob && blob.byteLength) return Buffer.from(blob);
  return readFileSync(templatePath());
}

async function insertReport(report: Report, blob: Buffer | null) {
  await (
    await database()
  )
    .prepare(
      `INSERT INTO reports (
        id, title, prepared_by, source_filename, created_at, updated_at, prefix_map, lines, source_blob
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      report.id,
      report.title,
      report.preparedBy,
      report.sourceFilename,
      report.createdAt,
      report.updatedAt,
      JSON.stringify(report.prefixMap),
      JSON.stringify(report.lines),
      blob,
    );
}

async function createBlankReportImpl(): Promise<Report> {
  await whenReady();
  assertWritable();
  const now = new Date().toISOString();
  const report: Report = {
    id: crypto.randomUUID(),
    title: "Monthly Service Report",
    preparedBy: "Timothy Adams",
    sourceFilename: null,
    createdAt: now,
    updatedAt: now,
    prefixMap: (globalDb.templatePrefix ?? []).map((entry) => ({ ...entry })),
    lines: [blankLine("1")],
  };
  await insertReport(report, null);
  logEvent("report.created", "Started a blank month.");
  return report;
}

async function importWorkbookImpl(
  data: Buffer,
  filename: string,
): Promise<Report> {
  await whenReady();
  assertWritable();
  const parsed = await parseWorkbook(data);
  await seedDirectory(parsed.directory);
  const now = new Date().toISOString();
  const lines = parsed.lines.length ? parsed.lines : [blankLine("1")];
  const report: Report = {
    id: crypto.randomUUID(),
    title: parsed.title || "Monthly Service Report",
    preparedBy: parsed.preparedBy || "Timothy Adams",
    sourceFilename: filename,
    createdAt: now,
    updatedAt: now,
    prefixMap: parsed.prefixMap,
    lines,
  };
  await insertReport(report, data);
  await rememberFromLines(lines);
  logEvent(
    "workbook.imported",
    `Imported ${lines.filter((line) => !isBlankLine(line)).length} work orders.`,
  );
  return report;
}

async function saveReportImpl(id: string, input: Report): Promise<Suggestions> {
  await whenReady();
  assertWritable();
  validateReportInput(input);
  const existing = await (
    await database()
  )
    .prepare("SELECT id, lines FROM reports WHERE id = ?")
    .get(id);
  if (!existing) {
    throw new Error("That report is no longer saved.");
  }
  const previous=JSON.parse(String(existing.lines)) as WorkOrder[];
  for(const line of input.lines) {
    if(!line.date || previous.find(old=>old.id===line.id)?.date===line.date) continue;
    const parsed=new Date(`${line.date}T00:00:00Z`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(line.date) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0,10)!==line.date) throw new Error('Invalid work-order date. Choose a calendar date.');
  }
  const db=await database();
  const lock=await db.prepare("SELECT value FROM meta WHERE key = ?").get(`report-month:${id}`);
  const monthKey=lock ? String(lock.value) : workbookMonth(previous) || workbookMonth(input.lines);
  if(monthKey) {
    for(const line of input.lines) {
      const before=previous.find(old=>old.id===line.id);
      if(line.date && line.date!==before?.date && !line.date.startsWith(`${monthKey}-`)) throw new Error(`Invalid date: this workbook is locked to ${monthKey}. Start a new month for that date.`);
    }
    if(!lock) await db.query("INSERT INTO meta (key, value) VALUES (?, ?)",[`report-month:${id}`,monthKey]);
  }
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const prefixMap = Array.isArray(input.prefixMap) ? input.prefixMap : [];
  await (
    await database()
  )
    .prepare(
      `UPDATE reports
       SET title = ?, prepared_by = ?, updated_at = ?, prefix_map = ?, lines = ?
       WHERE id = ?`,
    )
    .run(
      input.title?.trim() || "Monthly Service Report",
      input.preparedBy?.trim() || "",
      new Date().toISOString(),
      JSON.stringify(prefixMap),
      JSON.stringify(lines),
      id,
    );
  await rememberFromLines(lines);
  logEvent("report.saved", "Saved report changes.");
  return getSuggestions();
}

async function deleteReportImpl(id: string): Promise<void> {
  await whenReady();
  assertWritable();
  await (await database()).prepare("DELETE FROM reports WHERE id = ?").run(id);
  await (await database()).query("DELETE FROM meta WHERE key = ?",[`report-month:${id}`]);
  logEvent("report.deleted", "Deleted a month.");
}

// Serialize each report mutation with backups and storage migration.
export async function createBlankReport() {
  await whenReady();
  return (await database()).transaction(() => createBlankReportImpl());
}
export async function importWorkbook(data: Buffer, filename: string) {
  await whenReady();
  return (await database()).transaction(() =>
    importWorkbookImpl(data, filename),
  );
}
export async function saveReport(id: string, input: Report) {
  await whenReady();
  return (await database()).transaction(() => saveReportImpl(id, input));
}
export async function deleteReport(id: string) {
  await whenReady();
  return (await database()).transaction(() => deleteReportImpl(id));
}
