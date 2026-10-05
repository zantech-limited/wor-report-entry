import { database, assertWritable, writesPaused } from "./storage";
import type { WorkOrder } from "./model";
import { logEvent } from "./events";

import type { Part } from "./parts-model";
export type { Part } from "./parts-model";
/** Each occurrence on a saved work-order part line is one use, regardless of QTY. */
export async function partUsage() {
  const counts = new Map<string, number>();
  const variants = new Map<string, Map<string, {description: string; count: number}>>();
  for (const row of await (await database()).query("SELECT lines FROM reports")) {
    for (const line of JSON.parse(String(row.lines)) as WorkOrder[]) {
      const numbers = line.partNo.split(/\r?\n/);
      const descriptions = line.description.split(/\r?\n/);
      for (const [index, value] of numbers.entries()) {
        const partNo = value.trim();
        if (!partNo || /^n\s*\/\s*a$/i.test(partNo)) continue;
        const key = partNo.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
        const description = numbers.length === descriptions.length ? descriptions[index].trim() : "";
        if (description) {
          const options = variants.get(key) ?? new Map();
          const descriptionKey = description.toLowerCase().replace(/\s+/g, " ");
          const option = options.get(descriptionKey) ?? {description, count: 0};
          option.count++;
          options.set(descriptionKey, option);
          variants.set(key, options);
        }
      }
    }
  }
  return { counts, variants, totalUses: [...counts.values()].reduce((sum, count) => sum + count, 0), usedPartNumbers: counts.size };
}
export async function rememberParts(lines: Pick<WorkOrder, "partNo" | "description" | "qty">[]) {
  const db = await database();
  for (const line of lines) {
    const numbers = line.partNo.split(/\r?\n/);
    const descriptions = line.description.split(/\r?\n/);
    const quantities = line.qty.split(/\r?\n/);
    // Do not guess which description belongs to a part when rows are misaligned.
    if (numbers.length !== descriptions.length) continue;
    for (let index = 0; index < numbers.length; index++) {
      const partNo = numbers[index].trim();
      const description = descriptions[index].trim();
      if (!partNo || /^n\s*\/\s*a$/i.test(partNo) || partNo.length > 255 || !description || description.length > 2000) continue;
      const quantity = quantities.length === numbers.length ? quantities[index].trim() : "";
      const defaultQty = /^\d+(\.\d+)?$/.test(quantity) && Number(quantity) > 0 ? quantity : "1";
      // Saved work orders never overwrite curated descriptions or reactivate archived parts.
      if (await db.prepare("SELECT part_no FROM parts WHERE part_no = ?").get(partNo)) continue;
      await db.query("INSERT INTO parts (part_no, description, default_qty, active, updated_at) VALUES (?, ?, ?, ?, ?)",
        [partNo, description, defaultQty, 1, new Date().toISOString()]);
    }
  }
}

async function backfillParts() {
  const db = await database();
  await db.transaction(async () => {
    if (writesPaused() || await db.prepare("SELECT value FROM meta WHERE key = 'parts-from-reports-v1'").get()) return;
    for (const row of await db.query("SELECT lines FROM reports ORDER BY updated_at DESC, id")) {
      await rememberParts(JSON.parse(String(row.lines)));
    }
    await db.query("INSERT INTO meta (key, value) VALUES (?, ?)", ["parts-from-reports-v1", "1"]);
  });
}
export async function listParts(includeArchived = false): Promise<Part[]> {
  await backfillParts();
  const usage = await partUsage();
  const resolutions = new Map((await (await database()).query("SELECT key, value FROM meta WHERE key LIKE 'part-description:%'"))
    .map(row => [String(row.key).slice("part-description:".length), JSON.parse(String(row.value)) as string[]]));
  const rows = await (
    await database()
  ).query(
    `SELECT * FROM parts ${includeArchived ? "" : "WHERE active = 1"} ORDER BY part_no`,
  );
  return rows.map((row) => {
    const key = String(row.part_no).toLowerCase();
    const options = new Map(usage.variants.get(key) ?? []);
    const currentKey = String(row.description).toLowerCase().replace(/\s+/g, " ");
    if (!options.has(currentKey)) options.set(currentKey, {description: String(row.description), count: 0});
    return ({
    partNo: String(row.part_no),
    description: String(row.description),
    defaultQty: "1",
    active: Number(row.active) === 1,
    usageCount: usage.counts.get(String(row.part_no).toLowerCase()) ?? 0,
    descriptionVariants: [...options.values()],
    needsConsolidation: options.size > 1 && [...options.keys()].some(description => !(resolutions.get(key) ?? []).includes(description)),
  });
  });
}
export function validatePart(input: unknown): Part {
  if (!input || typeof input !== "object")
    throw new Error("Enter a part number and description.");
  const p = input as Part;
  if (
    typeof p.partNo !== "string" ||
    !p.partNo.trim() ||
    p.partNo.length > 255 ||
    /[\r\n]/.test(p.partNo)
  )
    throw new Error("Enter a single part number (up to 255 characters).");
  if (
    typeof p.description !== "string" ||
    !p.description.trim() ||
    p.description.length > 2000 ||
    /[\r\n]/.test(p.description)
  )
    throw new Error("Enter a single-line description.");
  if (typeof p.active !== "boolean")
    throw new Error("Invalid part availability.");
  return {
    partNo: p.partNo.trim(),
    description: p.description.trim(),
    defaultQty: "1",
    active: p.active,
  };
}
export async function savePart(input: unknown) {
  const p = validatePart(input);
  const db = await database();
  await db.transaction(async () => {
    assertWritable();
    const existing = await db
      .prepare("SELECT part_no FROM parts WHERE part_no = ?")
      .get(p.partNo);
    if (existing)
      await db.query(
        "UPDATE parts SET description = ?, default_qty = ?, active = ?, updated_at = ? WHERE part_no = ?",
        [
          p.description,
          p.defaultQty,
          p.active ? 1 : 0,
          new Date().toISOString(),
          p.partNo,
        ],
      );
    else
      await db.query(
        "INSERT INTO parts (part_no, description, default_qty, active, updated_at) VALUES (?, ?, ?, ?, ?)",
        [
          p.partNo,
          p.description,
          p.defaultQty,
          p.active ? 1 : 0,
          new Date().toISOString(),
        ],
      );
    if ((input as {consolidate?: boolean}).consolidate === true) {
      const key = p.partNo.toLowerCase();
      const usage = await partUsage();
      const known = [...(usage.variants.get(key)?.keys() ?? []), p.description.toLowerCase().replace(/\s+/g, " ")];
      const metaKey = `part-description:${key}`;
      await db.query("DELETE FROM meta WHERE key = ?", [metaKey]);
      await db.query("INSERT INTO meta (key, value) VALUES (?, ?)", [metaKey, JSON.stringify(known)]);
    }
  });
  logEvent("parts.saved", "Updated the parts catalog.");
}
