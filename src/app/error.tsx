"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-semibold">The report desk could not open</h1>
      <p className="text-sm text-muted-foreground">The server could not load this page. Retry, or ask Admin to check the shared database connection. Saved device drafts are retained.</p>
      {error.digest && <p className="text-xs text-muted-foreground">Support reference: {error.digest}</p>}
      <a href="/offline" className="text-sm underline">Open device drafts</a>
      <a href="/diagnostics" className="text-sm underline">Admin connection diagnostics</a>
      <Button type="button" className="w-fit" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
