import assert from "node:assert/strict";
import {
  filterReportEntries,
  technicianJobs,
  technicianHours,
} from "../src/lib/reporting";
import { blankLine, type WorkEntry } from "../src/lib/model";
import { sameOrigin } from "../src/lib/admin-auth";
import { duplicateKey, duplicateFields, repeatSummary } from "../src/lib/duplicates";

assert.equal(duplicateKey(" N/A "), "");
assert.equal(duplicateKey("n / a"), "");
assert.deepEqual(duplicateFields(duplicateKey("N/A"), duplicateKey("N/A"), {wor:"N/A", serialNo:"N/A"}), []);
assert.deepEqual(duplicateFields("wor-1", "", {wor:"WOR-1", serialNo:"N/A"}), ["WOR"]);
assert.equal(repeatSummary(3, 2), "3 WOR repeats and 2 serial repeats");
assert.equal(repeatSummary(0, 1), "1 serial repeat");
assert.equal(repeatSummary(1, 0), "1 WOR repeat");

const entry = {
  ...blankLine("1"),
  reportId: "fixture",
  lineIndex: 0,
  monthLabel: "Oct 2026",
  date: "2026-10-05",
  hours: 2.5,
  revenue: 0,
  technician: "Primary",
  secondaryTech: "Assistant",
} as WorkEntry;
const entries = [
  entry,
  {
    ...entry,
    lineIndex: 1,
    technician: "Assistant",
    secondaryTech: "Assistant",
    date: "2026-10-06",
    hours: 1,
  },
  { ...entry, lineIndex: 2, date: "", hours: null },
];
assert.equal(
  technicianJobs(entries, "Assistant").length,
  3,
  "Secondary-only jobs must appear and same-name roles must count once.",
);
assert.equal(
  technicianHours(entries).find((row) => row.label === "Assistant")?.value,
  "3.5",
);
assert.equal(
  filterReportEntries(entries, "2026-10-05", "2026-10-05", false).length,
  1,
  "Inclusive range endpoints failed.",
);
assert.equal(filterReportEntries(entries, "", "", true).length, 3);
assert.equal(
  filterReportEntries(entries, "2026-10-06", "2026-10-05", true).length,
  0,
);
assert(
  sameOrigin(
    new Request("http://0.0.0.0:3000/api/admin", {
      headers: { host: "127.0.0.1:43124", origin: "http://127.0.0.1:43124" },
    }),
  ),
  "Container host translation failed.",
);
assert(
  !sameOrigin(
    new Request("http://0.0.0.0:3000/api/admin", {
      headers: { host: "127.0.0.1:43124", origin: "http://foreign.example" },
    }),
  ),
);
console.log(
  "reporting checks passed: secondary hours, no double count, inclusive dates, undated handling, container origin validation",
);
