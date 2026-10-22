"use client";
import { crewNames } from "@/lib/crew";
import { formatCopycount } from "@/lib/copycount";
import { nameKey } from "@/lib/model";
import type { FieldJob, Signature } from "@/lib/field-model";
export function SignatureImage({ value }: { value?: Signature }) {
  return value ? (
    <svg
      viewBox="0 0 600 160"
      className="h-16 w-full"
      aria-label="Captured signature"
    >
      {value.strokes.map((stroke, i) => (
        <polyline
          key={i}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={stroke.map(([x, y]) => `${x * 600},${y * 160}`).join(" ")}
        />
      ))}
    </svg>
  ) : (
    <span className="text-xs text-slate-500">Not signed</span>
  );
}
export function CustomerFormPreview({ job }: { job: FieldJob }) {
  const { line, fields } = job,
    noCharge = nameKey(line.paymentMethod) === "no charge";
  const field = (label: string, value: string) => (
    <div className="min-h-12 border border-slate-600 p-2">
      <div className="text-[10px] font-semibold">{label}</div>
      <p className="whitespace-pre-wrap break-words text-xs leading-5">
        {value || " "}
      </p>
    </div>
  );
  const band = (text: string) => (
    <h3 className="mt-3 border border-slate-600 bg-slate-200 px-2 py-1 text-xs font-bold">
      {text}
    </h3>
  );
  const choices = [
    "Rental",
    "ServMaint",
    "Charge",
    "Cash",
    "PM",
    "Gold",
    "Silver",
    "Bronze",
  ];
  return (
    <article
      className="rounded-lg border bg-white p-5 text-slate-950 shadow-sm"
      aria-label="Customer work order preview"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <strong className="text-lg text-red-800">ZANTECH</strong>
          <p className="text-[9px]">
            34 Richmond Street, Port of Spain
            <br />
            Trinidad, W.I. · (868) 623-1041 / 626-2284
            <br />
            sales@zantechtt.com
          </p>
        </div>
        <h2 className="text-lg font-bold">Work Order Request</h2>
        <div>
          {noCharge && <p className="text-xs font-bold">NO CHARGE</p>}
          <p className="max-w-48 break-all text-sm font-bold text-red-600">
            Req. No. {line.wor || "Pending request number"}
          </p>
        </div>
      </header>
      {band("Client Worksite Details")}
      <div className="grid grid-cols-2">
        {field("Client Name", line.customer)}
        {field("Client Address", fields.clientAddress || line.location)}
      </div>
      {band("Order Details")}
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {field("Date Schedule", fields.scheduledDate)}
        {field("Phone No.", fields.phone)}
        {field("Requester Name", fields.requesterName)}
        {field("Email", fields.requesterEmail)}
      </div>
      <div className="grid grid-cols-2">
        {field("Tech. Name", crewNames(line).join(", "))}
        {field("Description of Work Required", fields.workRequired)}
      </div>
      {band("Details of Work Carried Out")}
      <p className="min-h-28 whitespace-pre-wrap break-words border-x border-b p-2 text-xs leading-6">
        {fields.workCarriedOut || " "}
      </p>
      <div className="grid grid-cols-2">
        <div>
          {band("Material Used")}
          {field(
            "Part / description / quantity",
            [line.partNo, line.description, line.qty]
              .filter(Boolean)
              .join("\n"),
          )}
        </div>
        <div>
          {band("Equipment Used")}
          {field(
            "Model / Serial / Copy count",
            [line.modelNo, line.serialNo, formatCopycount(line.copycount)]
              .filter(Boolean)
              .join("\n"),
          )}
          <div className="flex flex-wrap gap-2 border border-slate-600 p-2">
            {choices.map((choice) => {
              const selected =
                !noCharge &&
                (nameKey(line.slaType) === nameKey(choice) ||
                  nameKey(line.paymentMethod) === nameKey(choice) ||
                  (choice === "PM" && line.serviceType === "PM") ||
                  (choice === "Charge" &&
                    Number(line.revenue.replace(/[$,]/g, "")) !== 0 &&
                    nameKey(line.paymentMethod) !== "cash"));
              return (
                <span
                  key={choice}
                  className={`rounded-full border px-1.5 py-0.5 text-[10px] ${selected ? "border-slate-950" : "border-transparent"}`}
                >
                  {choice}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2">
        {field("Other Work Performed", fields.otherPerformed)}
        {field("Other Work Needed", fields.otherNeeded)}
      </div>
      {band("Completion Information")}
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {field("Date Started", fields.startedDate)}
        {field("Time Started", line.arrivalTime)}
        {field("Date Completed", fields.completedDate)}
        {field("Time Completed", line.departureTime)}
      </div>
      {band("Completed By")}
      <div className="grid grid-cols-3">
        {field("Print Name", fields.completedByName)}
        <div className="border p-1">
          <SignatureImage value={job.technicianSignature} />
        </div>
        {field(
          "Designation / Date",
          fields.completedByDesignation + "\n" + fields.completedDate,
        )}
      </div>
      {band("Approved By")}
      <div className="grid grid-cols-3">
        {field("Print Name", fields.approvedByName)}
        <div className="border p-1">
          <SignatureImage value={job.signature} />
        </div>
        {field(
          "Designation / Date",
          fields.approvedByDesignation + "\n" + fields.approvedDate,
        )}
      </div>
      <p className="mt-3 text-[9px] text-slate-500">
        Customer-visible work details only. Internal notes are excluded.
      </p>
    </article>
  );
}
