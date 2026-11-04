import assert from "node:assert/strict";
import {
  canonicalSnapshot,
  emptyJob,
  validSignature,
} from "../src/lib/field-model";
import {
  hashSnapshot,
  legacyHashSnapshot,
  signedContentMatches,
} from "../src/lib/field-jobs";

/**
 * Frozen on 0.5.2, before the 0.5.3 review. A change to signed fields,
 * trimming, key order, or the hash inputs fails this check. UI and header
 * fixes must keep both digests.
 */
const CANONICAL =
  "4d4bb9ca1b537babd70ee3f13ee7e520dc0aa51f9cef3342f5e0305b9c0ec34a";
const LEGACY =
  "746cc21b65d850cafa2f438b831c87bf01632011d1552f604e8b93f4e7711189";

const job = emptyJob("00000000-0000-4000-8000-0000000000aa");
Object.assign(job.line, {
  customer: " Acme ",
  wor: "WO-1",
  comments: "internal",
  date: "2026-10-22",
});
job.fields.workRequired = " Replace belt ";
job.signature = { strokes: [[[0.1, 0.2], [0.4, 0.6], [0.7, 0.3]]] };
job.technicianSignature = { strokes: [[[0.2, 0.2], [0.5, 0.8]]] };

assert.equal(validSignature(job.signature), true);
assert.equal(validSignature(job.technicianSignature), true);
const snapshot = canonicalSnapshot(job);
assert.equal(snapshot.line.customer, "Acme");
assert.equal(snapshot.fields.workRequired, "Replace belt");
assert.equal("comments" in snapshot.line, false);
assert.equal(hashSnapshot(job), CANONICAL);
assert.equal(legacyHashSnapshot(job), LEGACY);
assert.equal(signedContentMatches(CANONICAL, job), true);
assert.equal(signedContentMatches(LEGACY, job), true);

const internalNote = structuredClone(job);
internalNote.line.comments = "a different internal note";
assert.equal(hashSnapshot(internalNote), CANONICAL);

const visible = structuredClone(job);
visible.fields.workRequired = "Replace belt and roller";
assert.notEqual(hashSnapshot(visible), CANONICAL);
assert.equal(signedContentMatches(CANONICAL, visible), false);

console.log(
  "Signature contract unchanged: canonical and legacy hashes match the frozen vectors.",
);
