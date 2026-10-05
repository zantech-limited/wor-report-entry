export type Part = {
  partNo: string;
  description: string;
  defaultQty: string;
  active: boolean;
  usageCount?: number;
  descriptionVariants?: { description: string; count: number }[];
  needsConsolidation?: boolean;
};

/** A deliberate catalog pick replaces only the matching multiline row. */
export function applyPartLine(
  partNumbers: string,
  descriptions: string,
  quantities: string,
  row: number,
  part: Part,
) {
  function replace(value: string, next: string) {
    const lines = value.split("\n");
    while (lines.length <= row) lines.push("");
    lines[row] = next;
    return lines.join("\n");
  }
  return {
    partNo: replace(partNumbers, part.partNo),
    description: replace(descriptions, part.description),
    qty: replace(quantities, "1"),
  };
}
