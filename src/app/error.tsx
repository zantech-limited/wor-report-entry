"use client";

import { Button } from "@/components/ui/button";
import { databaseOutage, missingTemplate } from "@/lib/outage";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const detail = error.message || "";
  const explanation = missingTemplate(detail)
    ? "A required workbook template is missing from this deployment. Ask Admin to redeploy a build that includes templates/monthly-service-report.xlsm."
    : databaseOutage(detail)
      ? "Ask Admin to check the shared database connection and deployment settings."
      : "Ask Admin to check the deployment logs for this support reference.";
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-semibold">The report desk could not open</h1>
      <p className="text-sm text-muted-foreground">The server could not load this page. {explanation} Saved device drafts are retained.</p>
      {error.digest && <p className="text-xs text-muted-foreground">Support reference: {error.digest}</p>}
      <a href="/offline" className="text-sm underline">Open device drafts</a>
      <a href="/diagnostics" className="text-sm underline">Admin connection diagnostics</a>
      <Button type="button" className="w-fit" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
