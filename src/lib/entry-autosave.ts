const delayedFields = new Set(["line-customer", "line-tech", "line-secondary-tech", "line-model", "line-serial"]);
export function delayedEntryField(id: string) { return delayedFields.has(id); }
export function blocksEntryAutosave(id: string) { return delayedEntryField(id) || id === "line-date"; }
export function entrySaveDelay(deadline: number, now: number) { return Math.max(400, deadline - now); }
