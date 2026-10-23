import { createHash } from "node:crypto";
import {
  nextRequestNumber,
  noteRequestNumber,
  requestNumberTaken,
} from "./request-number";
import { database } from "./storage";
import {
  records,
  record,
  insertRecord,
  updateRecord,
  type DeskRecord,
} from "./records";
import {
  CONTACT_FIELDS,
  FORM_OPTIONS,
  customerSnapshot,
  emptyFields,
  validSignature,
  type FieldJob,
  type Schedule,
} from "./field-model";
import {
  blankLine,
  nameKey,
  nextLineNo,
  type Report,
  type WorkOrder,
} from "./model";
import {
  saveReportChecked,
  whenReady,
  getReport,
  createBlankReport,
} from "./db";
import type { Actor } from "./accounts";
import { crewIncludes, crewNames } from "./crew";
import { withFieldProjection } from "./field-projection-context";

export function canSeeJob(actor: Actor, row: DeskRecord<FieldJob>) {
  return actor.role !== "tech" || row.data.assignedIds.includes(actor.id);
}
export function hashSnapshot(job: FieldJob) {
  return createHash("sha256")
    .update(JSON.stringify(customerSnapshot(job)))
    .digest("hex");
}
export async function assignedUsers(ids: string[]) {
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 6 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== "string" || id.length > 100)
  )
    throw new Error("Choose one to six distinct technicians.");
  const db = await database();
  const users = [];
  for (const id of ids) {
    const row = await db
      .prepare(
        `SELECT id, name, status, ${db.config.engine === "mysql" ? "`technicianName`" : '"technicianName"'} FROM desk_user WHERE id = ?`,
      )
      .get(id);
    if (!row || row.status !== "active" || !String(row.technicianName).trim())
      throw new Error("An assigned technician is unavailable.");
    users.push({ id: String(row.id), name: String(row.technicianName) });
  }
  if (new Set(users.map((user) => nameKey(user.name))).size !== users.length)
    throw new Error(
      "Each assigned account must have a distinct technician identity.",
    );
  return users;
}
export function validateFieldJob(value: unknown): asserts value is FieldJob {
  const job = value as FieldJob;
  if (!job || typeof job !== "object" || !job.line || !job.fields)
    throw new Error("Invalid job.");
  if (
    job.fields.serviceOption !== undefined &&
    !FORM_OPTIONS.includes(job.fields.serviceOption)
  )
    throw new Error("Choose one valid customer form option.");
  for (const key of Object.keys(blankLine()) as (keyof WorkOrder)[])
    if (
      typeof job.line[key] !== "string" ||
      String(job.line[key]).length > 10000
    )
      throw new Error("Invalid work-order fields.");
  for (const key of CONTACT_FIELDS)
    if (
      typeof job.fields[key] !== "string" ||
      job.fields[key].length >
        ([
          "workRequired",
          "workCarriedOut",
          "otherPerformed",
          "otherNeeded",
        ].includes(key)
          ? 20000
          : 512)
    )
      throw new Error("Invalid customer form fields.");
  for (const date of [
    job.line.date,
    job.fields.scheduledDate,
    job.fields.startedDate,
    job.fields.completedDate,
    job.fields.approvedDate,
  ])
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date)
    )
      throw new Error("Choose valid calendar dates.");
  if (
    job.fields.startedDate &&
    job.fields.completedDate &&
    job.line.arrivalTime &&
    job.line.departureTime &&
    `${job.fields.startedDate}T${job.line.arrivalTime}` >
      `${job.fields.completedDate}T${job.line.departureTime}`
  )
    throw new Error("Completion must follow the start.");
  if (
    (job.signature && !validSignature(job.signature)) ||
    (job.technicianSignature && !validSignature(job.technicianSignature))
  )
    throw new Error("Invalid or empty signature.");
  if (!job.line.date) throw new Error("Date is required before syncing.");
  if (
    job.fields.requesterEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.fields.requesterEmail)
  )
    throw new Error("Enter a valid requester email.");
  if (typeof job.scheduleId !== "string" || job.scheduleId.length > 100)
    throw new Error("Invalid schedule link.");
}
export async function saveFieldJob(
  actor: Actor,
  id: string,
  input: FieldJob,
  revision: number,
  operationId: string,
  submit: boolean,
) {
  if (!/^[a-f0-9-]{36}$/i.test(id) || !/^[a-f0-9-]{36}$/i.test(operationId))
    throw new Error("Invalid job identifier.");
  validateFieldJob(input);
  await whenReady();
  const db = await database();
  return db.transaction(async () => {
    const acknowledgement = await record<{
      jobId: string;
      revision: number;
      requestNumber?: string;
    }>(`operation:${operationId}`);
    if (acknowledgement) {
      if (
        acknowledgement.ownerId !== actor.id ||
        acknowledgement.data.jobId !== id
      )
        throw new Error("Operation identifier is already in use.");
      return acknowledgement.data;
    }
    const previous = await record<FieldJob>(id, true);
    let legacySource: Report | null = null;
    if (!previous) {
      const sources = await db.query("SELECT id,lines FROM reports");
      for (const source of sources) {
        if (
          (JSON.parse(String(source.lines)) as WorkOrder[]).some(
            (line) => line.id === id,
          )
        ) {
          if (actor.role !== "admin")
            throw new Error("Only Admin can amend imported work orders.");
          legacySource = await getReport(String(source.id));
          if (legacySource?.updatedAt !== input.sourceUpdatedAt)
            throw new Error(
              "Conflict: the imported workbook changed. Reload before amending it.",
            );
          break;
        }
      }
    }
    if (previous && (previous.kind !== "job" || !canSeeJob(actor, previous)))
      throw new Error("Work order not found.");
    if (previous && previous.revision !== revision)
      throw new Error(
        "Conflict: this work order changed. Review the server version before uploading.",
      );
    if (!previous && revision !== 0)
      throw new Error("Conflict: reload this work order before uploading.");
    if (actor.role !== "tech" && actor.role !== "admin")
      throw new Error("Your role cannot edit work orders.");
    if (
      actor.role === "tech" &&
      previous &&
      previous.data.assignedIds[0] !== actor.id
    )
      throw new Error(
        "Only the lead technician or Admin can edit this shared job.",
      );
    if (actor.role === "tech" && previous && previous.data.state !== "draft")
      throw new Error("Submitted work orders require an Admin amendment.");
    if (actor.role === "tech" && !previous && input.assignedIds[0] !== actor.id)
      throw new Error("You must be the lead technician on your own job.");
    if (
      previous &&
      actor.role === "tech" &&
      JSON.stringify(input.assignedIds) !==
        JSON.stringify(previous.data.assignedIds)
    )
      throw new Error("Ask Admin to change assignments on an existing job.");
    const users = await assignedUsers(input.assignedIds);
    if (input.scheduleId) {
      const schedule = await record<Schedule>(input.scheduleId, true);
      if (
        !schedule ||
        schedule.kind !== "schedule" ||
        schedule.data.status !== "scheduled" ||
        (actor.role === "tech" &&
          !schedule.data.assignedIds.includes(actor.id)) ||
        (schedule.data.jobId && schedule.data.jobId !== id)
      )
        throw new Error("That schedule is unavailable.");
      if (
        schedule.data.assignedIds.some(
          (user) => !input.assignedIds.includes(user),
        )
      )
        throw new Error("Include the scheduled technicians.");
      await updateRecord(schedule, { ...schedule.data, jobId: id });
    }
    const line: WorkOrder = {
      ...blankLine(),
      ...input.line,
      id,
      technician: users[0].name,
      secondaryTech: users[1]?.name || "",
      additionalTechs: users.slice(2).map((user) => user.name),
    };
    if (!line.wor.trim()) {
      if (submit)
        throw new Error(
          "Complete a draft sync before signing so the request number is included.",
        );
      line.wor = previous?.data.line.wor || (await nextRequestNumber());
    } else if (line.wor !== previous?.data.line.wor) {
      await noteRequestNumber(line.wor);
      if (await requestNumberTaken(line.wor, id))
        throw new Error(
          "Conflict: that request number is already used. Clear it to assign the next number.",
        );
    }
    const data: FieldJob = {
      line,
      fields: input.fields,
      assignedIds: users.map((user) => user.id),
      scheduleId: input.scheduleId,
      state: "draft",
      reportId: previous?.data.reportId || legacySource?.id || "",
      signature: input.signature,
      technicianSignature: input.technicianSignature,
    };
    const digest = hashSnapshot(data),
      oldDigest = previous ? hashSnapshot(previous.data) : "";
    const changedAfterSigning =
      !!previous?.data.signedHash && digest !== previous.data.signedHash;
    const freshSignature =
      !!data.signature &&
      JSON.stringify(data.signature) !==
        JSON.stringify(previous?.data.signature);
    if (changedAfterSigning && !freshSignature) {
      data.signature = undefined;
      data.state = "amended";
    }
    if (
      actor.role === "admin" &&
      previous &&
      previous.data.state !== "draft" &&
      digest !== oldDigest
    ) {
      if (!input.amendmentReason?.trim() || input.amendmentReason.length > 1000)
        throw new Error("Describe the reason for this amendment.");
      data.amendmentReason = input.amendmentReason.trim();
    }
    if (submit) {
      if (!line.customer.trim())
        throw new Error("Complete the customer name before submitting.");
      if (
        !data.fields.startedDate ||
        !data.fields.completedDate ||
        ![data.line.arrivalTime, data.line.departureTime].every((value) =>
          /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
        )
      )
        throw new Error(
          "Complete the start and completion dates and times before submitting.",
        );
      if (changedAfterSigning && !freshSignature)
        throw new Error(
          "Customer-visible changes require a fresh customer signature.",
        );
      if (
        !data.signature ||
        !data.fields.approvedByName.trim() ||
        !data.fields.completedByName.trim() ||
        !data.fields.workCarriedOut.trim() ||
        !data.fields.requesterEmail ||
        !data.fields.approvedDate
      )
        throw new Error(
          "Complete the work details, names, customer signature, approval date and customer email before submitting.",
        );
      if (input.signedHash !== digest)
        throw new Error(
          "The signed preview changed. Review and sign this version again.",
        );
      const signed = await insertRecord(
        "signed",
        previous?.ownerId || actor.id,
        {
          jobId: id,
          snapshot: customerSnapshot(data),
          hash: digest,
          actor: actor.id,
          signedAt: new Date().toISOString(),
        },
      );
      data.signedHash = digest;
      data.signedRevisionId = signed.id;
      data.state = "submitted";
    } else if (previous?.data.signedHash && !changedAfterSigning) {
      data.signedHash = previous.data.signedHash;
      data.signedRevisionId = previous.data.signedRevisionId;
      data.state = previous.data.state;
    }
    // Lock a durable month key before choosing/creating the monthly workbook.
    const month = line.date.slice(0, 7),
      monthKey = `field-month:${month}`;
    if (
      !(await db.prepare("SELECT value FROM meta WHERE key = ?").get(monthKey))
    ) {
      try {
        await db.query("INSERT INTO meta (key,value) VALUES (?,?)", [
          monthKey,
          "",
        ]);
      } catch {
        throw new Error(
          "Conflict: another job is creating this month. Retry the same upload.",
        );
      }
    }
    const monthRow = await db
      .prepare(
        "SELECT value FROM meta WHERE key = ?" +
          (db.config.engine === "sqlite" ? "" : " FOR UPDATE"),
      )
      .get(monthKey);
    let target: Report | null = data.reportId
      ? await getReport(data.reportId)
      : null;
    if (target && target.monthKey && target.monthKey !== month)
      throw new Error(
        "Changing the month of an existing job requires Admin workbook migration.",
      );
    if (!target && monthRow?.value)
      target = await getReport(String(monthRow.value));
    if (!target) {
      target = await createBlankReport();
      await db.query("UPDATE meta SET value = ? WHERE key = ?", [
        target.id,
        monthKey,
      ]);
    }
    const index = target.lines.findIndex((row) => row.id === id);
    line.no = index >= 0 ? target.lines[index].no : nextLineNo(target.lines);
    data.reportId = target.id;
    if (index >= 0) target.lines[index] = line;
    else
      target.lines = [
        ...target.lines.filter((row) => row.date || row.customer || row.wor),
        line,
      ];
    // Projection occurs in the same transaction as the workflow record.
    await withFieldProjection(() =>
      saveReportChecked(target.id, target!, "when-changed"),
    );
    const saved = previous
      ? await updateRecord(previous, data)
      : await insertRecord("job", actor.id, data, id);
    if (previous)
      await insertRecord("job-history", previous.ownerId, {
        jobId: id,
        revision: previous.revision,
        snapshot: previous.data,
        actor: actor.id,
      });
    await insertRecord("audit", actor.id, {
      action: previous ? "job.updated" : "job.created",
      jobId: id,
      revision: saved.revision,
      reason: data.amendmentReason || "",
    });
    if (actor.role === "admin" && previous)
      for (const user of new Set([
        ...previous.data.assignedIds,
        ...data.assignedIds,
      ]))
        await insertRecord("alert", user, {
          text: data.assignedIds.includes(user)
            ? `Admin updated work order ${line.wor}. ${data.amendmentReason || ""}`
            : `Your assignment to work order ${line.wor} was removed.`,
          urgent: false,
          jobId: data.assignedIds.includes(user) ? id : undefined,
          acknowledged: false,
          sender: actor.name,
        });
    if (submit)
      await insertRecord("customer-mail", actor.id, {
        jobId: id,
        signedRevisionId: data.signedRevisionId,
        to: data.fields.requesterEmail,
        state: "queued",
        attempts: 0,
      });
    const ack = {
      jobId: id,
      revision: saved.revision,
      requestNumber: line.wor,
    };
    await insertRecord("operation", actor.id, ack, `operation:${operationId}`);
    return ack;
  });
}
export async function visibleJobs(actor: Actor, month: string) {
  const jobs = await records<FieldJob>("job"),
    visible = jobs.filter(
      (row) => canSeeJob(actor, row) && row.data.line.date.startsWith(month),
    ),
    known = new Set(jobs.map((row) => row.id));
  const db = await database();
  const users = await db.query(
    `SELECT id,${db.config.engine === "mysql" ? "`technicianName`" : '"technicianName"'} AS technician FROM desk_user WHERE status = ?`,
    ["active"],
  );
  for (const source of await db.query(
    "SELECT id,lines,updated_at FROM reports",
  ))
    for (const line of JSON.parse(String(source.lines)) as WorkOrder[]) {
      if (
        known.has(line.id) ||
        !line.date.startsWith(month) ||
        (actor.role === "tech" && !crewIncludes(line, actor.technicianName))
      )
        continue;
      const ids = crewNames(line)
        .map(
          (name) =>
            users.find(
              (user) => nameKey(String(user.technician)) === nameKey(name),
            )?.id,
        )
        .filter(Boolean)
        .map(String);
      const data: FieldJob = {
        line,
        fields: emptyFields(),
        assignedIds: ids,
        state: "draft",
        scheduleId: "",
        reportId: String(source.id),
        sourceUpdatedAt: String(source.updated_at),
      };
      visible.push({
        id: line.id,
        kind: "legacy-job",
        ownerId: ids[0] || "",
        revision: 0,
        data,
        updatedAt: String(source.updated_at),
      });
    }
  return visible.sort((a, b) =>
    b.data.line.date.localeCompare(a.data.line.date),
  );
}
