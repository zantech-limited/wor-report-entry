import { nameKey, uniqueNames } from "./model";
export type CrewFields = {
  technician: string;
  secondaryTech: string;
  additionalTechs?: string[];
};
export function crewNames(line: CrewFields) {
  return uniqueNames([
    line.technician,
    line.secondaryTech,
    ...(line.additionalTechs ?? []),
  ]);
}
export function crewIncludes(line: CrewFields, name: string) {
  return crewNames(line).some((value) => nameKey(value) === nameKey(name));
}
export function excelCrewComments(line: CrewFields & { comments: string }) {
  const extras = uniqueNames(line.additionalTechs ?? []).filter(
    (name) =>
      ![line.technician, line.secondaryTech].some(
        (value) => nameKey(value) === nameKey(name),
      ),
  );
  return extras.length
    ? `${line.comments.trimEnd()}${line.comments.trim() ? " " : ""}Additional technicians: ${extras.join(", ")}. `
    : line.comments;
}
