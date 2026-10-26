import { withAccountMail } from "../src/lib/smtp";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { auth, currentActor } from "../src/lib/accounts";
import { database } from "../src/lib/storage";
import { emptyJob } from "../src/lib/field-model";
import { deleteFieldLineFromDesk, saveFieldJob, visibleJobs, hashSnapshot } from "../src/lib/field-jobs";
import { records, record, recordsWhere } from "../src/lib/records";
import { crewNames, excelCrewComments } from "../src/lib/crew";
import { monthlyAnalysis } from "../src/lib/monthly-report";
import { createBlankReport, getReport, listWorkEntries, saveReport, saveReportChecked } from "../src/lib/db";
import { blankLine } from "../src/lib/model";
import { suggestionsForActor } from "../src/lib/field-suggestions";
import {
  commitFieldCustomer,
  commitFieldSerial,
  emptyFieldTouch,
} from "../src/lib/field-suggestion-model";
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
  for (const role of ["manager", "supervisor", "admin"] as const) {
    assert.equal(
      (await visibleJobs({ ...actor, id: users[6].id, role }, "2026-10")).length,
      1,
      `${role} sees every work order`,
    );
  }
  assert.equal(
    (await visibleJobs({ ...actor, role: "manager" }, "2026-10")).length,
    1,
    "A manager still sees a work order assigned to them",
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
  assert.match(firstSync.requestNumber!, /^OWOR\d{5,}$/);
  assert.notEqual(stored.data.line.wor, job.line.wor);
  assert.match(stored.data.line.wor, /^OWOR\d{5}$/);
  const shared = (await record<typeof shortJob>(shortId))!;
  assert.equal(shared.data.line.wor, firstSync.requestNumber);
  shared.data.fields.workRequired = "Changed from another device";
  const secondSync = await saveFieldJob(adminActor,shortId,shared.data,shared.revision,randomUUID(),false);
  assert.equal(secondSync.requestNumber, firstSync.requestNumber);
  await assert.rejects(saveFieldJob(actor,shortId,shortJob,1,randomUUID(),false), /Conflict:/);
  const history = await createBlankReport();
  const remembered = history.lines[0];
  await saveReport(history.id, {
    ...history,
    lines: [
      {
        ...remembered,
        customer: "Scoped Customer",
        location: "North Site",
        serialNo: "ABC1234",
        modelNo: "Bizhub 227",
        technician: "Tech 0",
        secondaryTech: "",
        additionalTechs: [],
        date: "2026-10-02",
        wor: "HIST-1",
      },
      {
        ...blankLine("2"),
        customer: "Scoped Customer",
        location: "South Site",
        serialNo: "HID9999",
        modelNo: "Secret Model",
        technician: "Tech 6",
        date: "2026-10-03",
        wor: "HIST-2",
        partsRequired: "No",
        paymentMethod: "No charge",
        revenue: "0",
        jobStatus: "Completed",
        ftf: "N/A",
      },
      {
        ...blankLine("3"),
        customer: "Hidden Customer",
        location: "Secret Site",
        serialNo: "SEC1111",
        modelNo: "Hidden Model",
        technician: "Tech 6",
        date: "2026-10-03",
        wor: "HIST-3",
        partsRequired: "No",
        paymentMethod: "No charge",
        revenue: "0",
        jobStatus: "Completed",
        ftf: "N/A",
      },
    ],
  });
  const walkInId = randomUUID();
  const walkIn = emptyJob(walkInId);
  Object.assign(walkIn.line, {
    date: "2026-10-08",
    customer: "Walk In Client",
    location: "Van",
    technician: actor.technicianName,
    additionalTechs: [],
  });
  walkIn.assignedIds = [actor.id];
  walkIn.fields.clientAddress = "1 Walk Street";
  walkIn.fields.phone = "555-0199";
  walkIn.fields.requesterName = "Walk Requester";
  walkIn.fields.requesterEmail = "walk@example.test";
  await saveFieldJob(actor, walkInId, walkIn, 0, randomUUID(), false);
  const contactId = randomUUID();
  const contactJob = emptyJob(contactId);
  Object.assign(contactJob.line, {
    date: "2026-10-08",
    customer: "Scoped Customer",
    location: "North Site",
    serialNo: "ABC1234",
    modelNo: "Bizhub 227",
    technician: actor.technicianName,
    additionalTechs: [],
  });
  contactJob.assignedIds = [actor.id];
  contactJob.fields.clientAddress = "12 Field Road";
  contactJob.fields.phone = "555-0100";
  contactJob.fields.requesterName = "Ada Request";
  contactJob.fields.requesterEmail = "ada@example.test";
  await saveFieldJob(actor, contactId, contactJob, 0, randomUUID(), false);
  const otherActor = {
    ...actor,
    id: users[6].id,
    role: "tech" as const,
    technicianName: "Tech 6",
  };
  const secretId = randomUUID();
  const secretJob = emptyJob(secretId);
  Object.assign(secretJob.line, {
    date: "2026-10-08",
    customer: "Hidden Customer",
    location: "Secret Site",
    technician: "Tech 6",
    additionalTechs: [],
  });
  secretJob.assignedIds = [users[6].id];
  secretJob.fields.clientAddress = "99 Secret Lane";
  secretJob.fields.phone = "555-0111";
  secretJob.fields.requesterName = "Hidden Requester";
  secretJob.fields.requesterEmail = "hidden@example.test";
  await saveFieldJob(otherActor, secretId, secretJob, 0, randomUUID(), false);
  assert.equal(actor.technicianName, "Tech 0");
  assert.equal(
    (await visibleJobs(actor, "2026-10")).some((row) => row.id === secretId),
    false,
    "A technician still cannot open another technician's work order",
  );
  assert.equal(
    (await visibleJobs(otherActor, "2026-10")).some((row) => row.id === walkInId),
    false,
  );
  const techView = await suggestionsForActor(actor);
  const otherView = await suggestionsForActor(otherActor);
  const managerView = await suggestionsForActor({ ...actor, role: "manager" });
  for (const view of [techView, otherView, managerView]) {
    for (const name of ["Hidden Customer", "Scoped Customer", "Walk In Client"])
      assert.equal(view.customers.includes(name), true, name);
    assert.equal(view.locationsByCustomer["Scoped Customer"]?.includes("North Site"), true);
    assert.equal(view.locationsByCustomer["Scoped Customer"]?.includes("South Site"), true);
    assert.equal(view.locationsByCustomer["Hidden Customer"]?.includes("Secret Site"), true);
    assert.equal(view.locationsByCustomer["Walk In Client"]?.includes("Van"), true);
    assert.equal(
      view.machinesByCustomer["Scoped Customer"]?.some(
        (machine) => machine.serialNo === "ABC1234" && machine.modelNo === "Bizhub 227",
      ),
      true,
    );
    assert.equal(
      view.machinesByCustomer["Scoped Customer"]?.some(
        (machine) => machine.serialNo === "HID9999" && machine.modelNo === "Secret Model",
      ),
      true,
    );
    assert.deepEqual(view.contactsByCustomer["Scoped Customer"], {
      addresses: ["12 Field Road"],
      phones: ["555-0100"],
      requesters: ["Ada Request"],
      emails: ["ada@example.test"],
    });
    assert.equal(
      view.contactsByCustomer["Hidden Customer"]?.addresses.includes("99 Secret Lane"),
      true,
    );
    assert.equal(
      view.contactsByCustomer["Walk In Client"]?.addresses.includes("1 Walk Street"),
      true,
    );
  }
  const picked = commitFieldCustomer(
    emptyJob(randomUUID()),
    "",
    "walk in client",
    techView,
    emptyFieldTouch(),
  );
  assert.equal(picked.job.line.customer, "Walk In Client");
  assert.equal(picked.job.line.location, "Van");
  assert.equal(picked.job.fields.clientAddress, "");
  assert.equal(picked.job.fields.phone, "");
  const several = commitFieldCustomer(
    emptyJob(randomUUID()),
    "",
    "Scoped Customer",
    managerView,
    emptyFieldTouch(),
  );
  assert.equal(several.job.line.location, "");
  const kept = commitFieldCustomer(
    {
      ...emptyJob(randomUUID()),
      line: { ...emptyJob(randomUUID()).line, location: "South Site" },
    },
    "",
    "Scoped Customer",
    managerView,
    emptyFieldTouch(),
  );
  assert.equal(kept.job.line.location, "South Site");
  const machineJob = emptyJob(randomUUID());
  machineJob.line.customer = "Scoped Customer";
  const machine = commitFieldSerial(
    machineJob,
    "abc1234",
    techView,
    emptyFieldTouch(),
    true,
  );
  assert.equal(machine.job.line.serialNo, "ABC1234");
  assert.equal(machine.job.line.modelNo, "Bizhub 227");
  assert.equal(machine.job.line.location, "North Site");
  assert.equal(machine.job.fields.phone, "");
  const unknown = commitFieldSerial(
    machineJob,
    "ZZZ999",
    techView,
    emptyFieldTouch(),
    false,
  );
  assert.equal(unknown.job.line.serialNo, "ZZZ999");
  assert.equal(unknown.job.line.modelNo, "");
  const fieldRow = (await record<typeof shortJob>(shortId))!;
  const reportId = fieldRow.data.reportId;
  const beforeDelete = await getReport(reportId);
  assert(beforeDelete);
  await assert.rejects(
    saveReportChecked(reportId, {
      ...beforeDelete,
      lines: beforeDelete.lines.filter((row) => row.id !== shortId),
    }),
    /Field service/,
  );
  assert.equal((await getReport(reportId))!.lines.some((row) => row.id === shortId), true);
  await assert.rejects(
    deleteFieldLineFromDesk(
      { ...actor, role: "tech" },
      reportId,
      shortId,
      fieldRow.data.line.wor,
    ),
    /role cannot/,
  );
  await assert.rejects(
    deleteFieldLineFromDesk(
      { ...actor, role: "manager" },
      reportId,
      shortId,
      fieldRow.data.line.wor,
    ),
    /role cannot/,
  );
  await assert.rejects(
    deleteFieldLineFromDesk(adminActor, reportId, shortId, "OWOR00000"),
    /exact work order number/,
  );
  const removed = await deleteFieldLineFromDesk(
    adminActor,
    reportId,
    shortId,
    fieldRow.data.line.wor,
  );
  assert.equal(removed.wor, fieldRow.data.line.wor);
  assert.equal(
    (await getReport(reportId))!.lines.some((row) => row.id === shortId),
    false,
  );
  assert.equal((await record(shortId))!.kind, "job-deleted");
  assert.ok(
    (
      await recordsWhere<{ action: string }>("audit", "jobId", [shortId])
    ).some((row) => row.data.action === "job.deleted"),
  );
  assert.ok(
    (
      await recordsWhere<{ reason?: string }>("job-history", "jobId", [shortId])
    ).some((row) => row.data.reason === "Deleted from desk Entry"),
  );
  await assert.rejects(
    saveFieldJob(adminActor, shortId, fieldRow.data, 0, randomUUID(), false),
    /deleted from the desk/,
  );
  await db.query("UPDATE desk_user SET status = ? WHERE id = ?", [
    "archived",
    actor.id,
  ]);
  assert.equal(await currentActor(new Headers({ cookie: cookies })), null);
  console.log(
    "Accounts/field checks passed: pending roles, real sessions, six-person history/hours, month isolation, idempotency, conflicts, signatures, revocation, shared suggestion values, and unchanged work-order visibility.",
  );
  process.exit(0);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
