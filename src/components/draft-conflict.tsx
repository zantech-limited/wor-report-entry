"use client";
import { useState } from "react";
import { deskApi } from "@/lib/client-api";
import { Button } from "./ui/button";
import { CustomerFormPreview } from "./customer-form-preview";
import type { DeskRecord } from "@/lib/records";
import type { FieldJob } from "@/lib/field-model";
import type { LocalDraft } from "@/lib/offline-vault";
export function DraftConflict({
  draft,
  onResolve,
}: {
  draft: LocalDraft;
  onResolve: (
    server: DeskRecord<FieldJob>,
    choice: "local" | "server" | "both",
  ) => void;
}) {
  const [server, setServer] = useState<DeskRecord<FieldJob>>(),
    [message, setMessage] = useState("");
  return (
    <div className="grid gap-3 rounded-lg border border-amber-400 p-3">
      <Button
        variant="outline"
        onClick={() =>
          void deskApi<{ job: DeskRecord<FieldJob> }>(
            `/api/field/jobs/${draft.id}`,
          )
            .then((data) => setServer(data.job))
            .catch((error) => setMessage(error.message))
        }
      >
        Compare with latest server version
      </Button>
      {server && (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <section>
              <h4 className="mb-2 font-medium">Your preserved device copy</h4>
              <CustomerFormPreview job={draft.job} />
            </section>
            <section>
              <h4 className="mb-2 font-medium">
                Latest server copy · revision {server.revision}
              </h4>
              <CustomerFormPreview job={server.data} />
            </section>
          </div>
          <p className="text-sm">
            Your current device copy is archived before a choice. Reapplying
            local details uses the latest crew assignments and clears approval
            so the customer can sign the reviewed result again. Keep both leaves
            the server copy in place and saves your device copy as a new draft.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onResolve(server, "server")}>
              Continue from server copy
            </Button>
            <Button variant="outline" onClick={() => onResolve(server, "local")}>
              Reapply my local details for review
            </Button>
            <Button variant="outline" onClick={() => onResolve(server, "both")}>
              Keep both copies
            </Button>
          </div>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
