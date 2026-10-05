import {
  blankLine,
  type Report,
  type WorkOrder,
  type PrefixEntry,
} from "./model";

export function validateReportInput(input: Report) {
  if (
    !input ||
    !Array.isArray(input.lines) ||
    !Array.isArray(input.prefixMap) ||
    typeof input.title !== "string" ||
    typeof input.preparedBy !== "string"
  )
    throw new Error("Invalid report data.");
  if (
    input.lines.length > 10000 ||
    input.prefixMap.length > 10000 ||
    input.title.length > 512 ||
    input.preparedBy.length > 255
  )
    throw new Error("Report exceeds the supported size.");
  const ids = new Set<string>();
  for (const line of input.lines) {
    if (!line || typeof line !== "object")
      throw new Error("Invalid work-order data.");
    for (const field of Object.keys(blankLine("1")) as (keyof WorkOrder)[]) {
      if (typeof line[field] !== "string" || line[field].length > 100000)
        throw new Error(`Invalid work-order field: ${field}.`);
    }
    for (const field of [
      "customer",
      "location",
      "technician",
      "secondaryTech",
    ] as const)
      if (line[field].trim().length > 255)
        throw new Error(`${field} must be 255 characters or fewer.`);
    if (!line.id || ids.has(line.id))
      throw new Error("Work orders must have unique IDs.");
    ids.add(line.id);
  }
  for (const prefix of input.prefixMap as PrefixEntry[]) {
    if (
      !prefix ||
      typeof prefix.prefix !== "string" ||
      typeof prefix.model !== "string" ||
      prefix.prefix.length > 32 ||
      prefix.model.length > 255
    )
      throw new Error("Invalid prefix map entry.");
  }
}
