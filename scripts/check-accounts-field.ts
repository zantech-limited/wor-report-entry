import { withAccountMail } from "../src/lib/smtp";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { auth, currentActor } from "../src/lib/accounts";
import { database } from "../src/lib/storage";
import { emptyJob } from "../src/lib/field-model";
import { saveFieldJob, visibleJobs, hashSnapshot } from "../src/lib/field-jobs";
import { records, record } from "../src/lib/records";
import { crewNames, excelCrewComments } from "../src/lib/crew";
import { monthlyAnalysis } from "../src/lib/monthly-report";
import { listWorkEntries } from "../src/lib/db";
async function main() {
  assert(
    process.env.DATA_DIR?.includes(".checks"),
    "Use an isolated .checks database.",
  );
  const db = await database();
  await (await getMigrations(auth().options)).runMigrations();
  await db.query("INSERT INTO meta (key,value) VALUES (?,?)", [
    "accounts-ready",
    "1",
  ]);
  const users = [];
  for (let i = 0; i < 7; i++) {
    const result = await withAccountMail(() =>
      auth().api.signUpEmail({
        body: {
          name: `Tech ${i}`,
          email: `tech${i}@example.test`,
          password: "Local-test-password-12345",
        },
      }),
    );
    users.push(result.user);
    await db.query(
      `UPDATE desk_user SET status = ?, ${db.config.engine === "mysql" ? "`technicianName`" : '"technicianName"'} = ?, ${db.config.engine === "mysql" ? "`emailVerified`" : '"emailVerified"'} = ? WHERE id = ?`,
      [
        "active",
        `Tech ${i}`,
        ["postgres", "supabase"].includes(db.config.engine) ? "true" : 1,
        result.user.id,
      ],
    );
  }
  assert.equal((await records("account-mail")).length, 7);
  const response = await withAccountMail(() =>
    auth().api.signInEmail({
      body: {
        email: "tech0@example.test",
        password: "Local-test-password-12345",
      },
      asResponse: true,
    }),
  );
  assert.equal(response.status, 200);
  const cookies = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
    actor = await currentActor(new Headers({ cookie: cookies }));
  assert(actor);
  assert.equal(actor.role, "tech");
  const id = randomUUID(),
    job = emptyJob(id);
  Object.assign(job.line, {
    date: "2026-10-22",
    customer: "Test customer",
    wor: `ZT-${id.replace(/-/g, "").toUpperCase()}`,
    technician: "Tech 0",
    secondaryTech: "Tech 1",
    additionalTechs: ["Tech 2", "Tech 3", "Tech 4", "Tech 5"],
    arrivalTime: "08:00",
    departureTime: "10:00",
    comments: "Existing note.",
  });
  job.assignedIds = users.slice(0, 6).map((user) => user.id);
  const operation = randomUUID(),
    saved = await saveFieldJob(actor, id, job, 0, operation, false);
  assert.equal(saved.revision, 1);
  assert.deepEqual(
    await saveFieldJob(actor, id, job, 0, operation, false),
    saved,
  );
  for (let i = 0; i < 6; i++) {
    const rows = await visibleJobs({ ...actor, id: users[i].id }, "2026-10");
    assert.equal(rows.length, 1);
  }
  assert.equal(
    (await visibleJobs({ ...actor, id: users[6].id }, "2026-10")).length,
    0,
  );
  assert.equal((await visibleJobs(actor, "2026-09")).length, 0);
  await assert.rejects(
    saveFieldJob(actor, id, job, 0, randomUUID(), false),
    /Conflict/,
  );
  const stored = (await record<typeof job>(id))!;
  assert.equal(crewNames(stored.data.line).length, 6);
  assert(
    excelCrewComments(stored.data.line).includes(
      "Existing note. Additional technicians: Tech 2, Tech 3, Tech 4, Tech 5. ",
    ),
  );
  const totals = monthlyAnalysis(await listWorkEntries());
  assert.equal(totals.crew.length, 6);
  assert(totals.crew.every((row) => row.hours === 2));
  const signed = structuredClone(stored.data);
  Object.assign(signed.fields, {
    workCarriedOut: "Serviced equipment",
    requesterEmail: "customer@example.test",
    completedByName: "Tech 0",
    approvedByName: "Customer",
    approvedDate: "2026-10-22",
    startedDate: "2026-10-22",
    completedDate: "2026-10-22",
  });
  signed.signature = {
    strokes: [
      [
        [0.1, 0.2],
        [0.2, 0.5],
        [0.7, 0.3],
      ],
    ],
  };
  signed.signedHash = hashSnapshot(signed);
  await saveFieldJob(actor, id, signed, 1, randomUUID(), true);
  assert.equal((await records("signed")).length, 1);
  assert.equal((await records("customer-mail")).length, 1);
  await assert.rejects(
    saveFieldJob(actor, id, signed, 2, randomUUID(), false),
    /Submitted/,
  );
  const latest = (await record<typeof job>(id))!;
  const adminActor = { ...actor, role: "admin" as const };
  const amendment = structuredClone(latest.data);
  amendment.fields.workCarriedOut = "A corrected work description";
  amendment.amendmentReason = "Correct the service details";
  amendment.signedHash = hashSnapshot(amendment);
  await assert.rejects(
    saveFieldJob(adminActor, id, amendment, 2, randomUUID(), true),
    /fresh customer signature/,
  );
  amendment.signature = {
    strokes: [
      [
        [0.15, 0.25],
        [0.4, 0.6],
        [0.75, 0.35],
      ],
    ],
  };
  amendment.signedHash = hashSnapshot(amendment);
  await saveFieldJob(adminActor, id, amendment, 2, randomUUID(), true);
  assert.equal(
    (await records("signed")).length,
    2,
    "Original signed copy must survive an amendment",
  );
  const reassigned = structuredClone((await record<typeof job>(id))!.data);
  reassigned.assignedIds = users.slice(1, 7).map((user) => user.id);
  reassigned.amendmentReason = "Reassign the crew";
  reassigned.signature = undefined;
  reassigned.signedHash = undefined;
  await saveFieldJob(adminActor, id, reassigned, 3, randomUUID(), false);
  assert.equal(
    (await visibleJobs(actor, "2026-10")).length,
    0,
    "Removed original owner must lose job access",
  );
  // New devices receive short numbers, and edits do not allocate another number.
  const shortId = randomUUID(), shortJob = emptyJob(shortId);
  Object.assign(shortJob.line, {date:"2026-10-22",customer:"",technician:"Tech 0",additionalTechs:[]});
  shortJob.assignedIds = [actor.id];
  shortJob.fields.startedDate = shortJob.fields.completedDate = "2026-10-22";
  shortJob.line.arrivalTime = "08:00";
  const firstSync = await saveFieldJob(actor,shortId,shortJob,0,randomUUID(),false);
  assert.match(firstSync.requestNumber!, /^WRETO-\d{5,}$/);
  const shared = (await record<typeof shortJob>(shortId))!;
  assert.equal(shared.data.line.wor, firstSync.requestNumber);
  shared.data.fields.workRequired = "Changed from another device";
  const secondSync = await saveFieldJob(adminActor,shortId,shared.data,shared.revision,randomUUID(),false);
  assert.equal(secondSync.requestNumber, firstSync.requestNumber);
  await assert.rejects(saveFieldJob(actor,shortId,shortJob,1,randomUUID(),false), /Conflict:/);
  await db.query("UPDATE desk_user SET status = ? WHERE id = ?", [
    "archived",
    actor.id,
  ]);
  assert.equal(await currentActor(new Headers({ cookie: cookies })), null);
  console.log(
    "Accounts/field checks passed: pending roles, real sessions, six-person history/hours, month isolation, idempotency, conflicts, signatures and revocation.",
  );
  process.exit(0);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
