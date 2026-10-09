import type { WorkOrder } from "./model";

const directoryFields = ["customer", "location", "technician", "secondaryTech", "partNo", "description", "qty"] as const;
const suggestionFields = ["customer", "location", "technician", "secondaryTech", "serialNo", "modelNo"] as const;
export function saveChanges(previous: WorkOrder[], next: WorkOrder[]) {
  const before = new Map(previous.map(line => [line.id, line]));
  return {
    catalogLines: next.filter(line => {
      const original = before.get(line.id);
      return !original || directoryFields.some(field => original[field] !== line[field]);
    }),
    suggestionsChanged: previous.length !== next.length || next.some(line => {
      const original = before.get(line.id);
      return !original || suggestionFields.some(field => original[field] !== line[field]);
    }),
  };
}
