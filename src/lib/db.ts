import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseWorkbook, templatePath, type DirectoryCounts } from "./excel";
import {
  blankLine,
  isBlankLine,
  reportMonthLabel,
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
  reportDb?: DatabaseSync;
  reportReady?: Promise<void>;
  templatePrefix?: PrefixEntry[];
};

function database(): DatabaseSync {
  if (!globalDb.reportDb) {
    const dir = path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, "reports.sqlite"));
    db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        prepared_by TEXT NOT NULL,
        source_filename TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        prefix_map TEXT NOT NULL,
        lines TEXT NOT NULL,
        source_blob BLOB
      );
      CREATE TABLE IF NOT EXISTS suggestions (
        kind TEXT NOT NULL,
        parent TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL,
        uses INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (kind, parent, value)
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    globalDb.reportDb = db;
  }
  return globalDb.reportDb;
}

export function whenReady(): Promise<void> {
  if (!globalDb.reportReady) {
    globalDb.reportReady = seedFromTemplate();
  }
  return globalDb.reportReady;
}

async function seedFromTemplate(): Promise<void> {
  const db = database();
  const seeded = db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get() as
    | { value: string }
    | undefined;
  const parsed = await parseWorkbook(readFileSync(templatePath()));
  globalDb.templatePrefix = parsed.prefixMap;
  if (!seeded) {
    seedDirectory(parsed.directory);
    db.prepare("INSERT INTO meta (key, value) VALUES ('seeded', '1')").run();
  }
}

function seedDirectory(directory: DirectoryCounts) {
  const db = database();
  const stmt = db.prepare(`
    INSERT INTO suggestions (kind, parent, value, uses)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(kind, parent, value) DO UPDATE SET uses = MAX(uses, excluded.uses)
  `);
  for (const [customer, uses] of directory.customers) {
    stmt.run("customer", "", customer, uses);
  }
  for (const [customer, sites] of directory.locations) {
    for (const [location, uses] of sites) {
      stmt.run("location", customer, location, uses);
    }
  }
  for (const [tech, uses] of directory.techs) {
    stmt.run("tech", "", tech, uses);
  }
}

export function rememberFromLines(lines: WorkOrder[]) {
  const db = database();
  const stmt = db.prepare(`
    INSERT INTO suggestions (kind, parent, value, uses)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(kind, parent, value) DO NOTHING
  `);
  for (const line of lines) {
    const customer = line.customer.trim();
    const location = line.location.trim();
    if (customer) stmt.run("customer", "", customer);
    if (customer && location) stmt.run("location", customer, location);
    if (line.technician.trim()) stmt.run("tech", "", line.technician.trim());
    if (line.secondaryTech.trim()) stmt.run("tech", "", line.secondaryTech.trim());
  }
}

export async function getSuggestions(): Promise<Suggestions> {
  await whenReady();
  const db = database();
  const rows = db
    .prepare(
      "SELECT kind, parent, value, uses FROM suggestions ORDER BY uses DESC, value COLLATE NOCASE ASC",
    )
    .all() as { kind: string; parent: string; value: string; uses: number }[];
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
  return {
    customers,
    locationsByCustomer,
    techs,
    machinesByCustomer: collectMachines(db),
  };
}

function collectMachines(db: DatabaseSync): Record<string, MachineRecord[]> {
  const reports = db
    .prepare("SELECT lines FROM reports ORDER BY updated_at ASC")
    .all() as { lines: string }[];
  const byCustomer = new Map<
    string,
    Map<string, { serialNo: string; modelNo: string; locations: Set<string>; visits: number }>
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
      if (location) current.locations.add(location);
      machines.set(key, current);
      byCustomer.set(customer, machines);
    }
  }
  const result: Record<string, MachineRecord[]> = {};
  for (const [customer, machines] of byCustomer) {
    result[customer] = [...machines.values()]
      .sort((a, b) => b.visits - a.visits || a.serialNo.localeCompare(b.serialNo))
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
  const rows = database()
    .prepare("SELECT id, lines FROM reports ORDER BY updated_at DESC")
    .all() as { id: string; lines: string }[];
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
        revenue: Number.isFinite(revenue) && line.revenue.trim() ? revenue : null,
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
  const rows = database()
    .prepare("SELECT * FROM reports ORDER BY updated_at DESC")
    .all() as ReportRow[];
  return rows.map(summaryOf);
}

export async function getReport(id: string): Promise<Report | null> {
  await whenReady();
  const row = database().prepare("SELECT * FROM reports WHERE id = ?").get(id) as
    | ReportRow
    | undefined;
  return row ? rowToReport(row) : null;
}

export async function getReportBlob(id: string): Promise<Buffer | null> {
  await whenReady();
  const row = database()
    .prepare("SELECT source_blob FROM reports WHERE id = ?")
    .get(id) as { source_blob: Buffer | null } | undefined;
  if (!row) return null;
  const blob = row.source_blob;
  if (blob && blob.byteLength) return Buffer.from(blob);
  return readFileSync(templatePath());
}

function insertReport(report: Report, blob: Buffer | null) {
  database()
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

export async function createBlankReport(): Promise<Report> {
  await whenReady();
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
  insertReport(report, null);
  return report;
}

export async function importWorkbook(data: Buffer, filename: string): Promise<Report> {
  await whenReady();
  const parsed = await parseWorkbook(data);
  seedDirectory(parsed.directory);
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
  insertReport(report, data);
  rememberFromLines(lines);
  return report;
}

export async function saveReport(id: string, input: Report): Promise<Suggestions> {
  await whenReady();
  const existing = database().prepare("SELECT id FROM reports WHERE id = ?").get(id);
  if (!existing) {
    throw new Error("That report is no longer saved.");
  }
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const prefixMap = Array.isArray(input.prefixMap) ? input.prefixMap : [];
  database()
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
  rememberFromLines(lines);
  return getSuggestions();
}

export async function deleteReport(id: string): Promise<void> {
  await whenReady();
  database().prepare("DELETE FROM reports WHERE id = ?").run(id);
}
