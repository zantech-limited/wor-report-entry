export function duplicateKey(value: string): string {
  const key = value.trim().toLowerCase();
  return /^n\s*\/\s*a$/.test(key) ? "" : key;
}

export function duplicateFields(wor: string, serial: string, other: {wor: string; serialNo: string}): string[] {
  return [
    wor && duplicateKey(other.wor) === wor ? "WOR" : "",
    serial && duplicateKey(other.serialNo) === serial ? "Serial" : "",
  ].filter(Boolean);
}

export function repeatSummary(wor: number, serial: number): string {
  return [wor ? `${wor} WOR ${wor === 1 ? "repeat" : "repeats"}` : "", serial ? `${serial} serial ${serial === 1 ? "repeat" : "repeats"}` : ""].filter(Boolean).join(" and ");
}
