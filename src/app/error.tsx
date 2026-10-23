"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import packageInfo from "../../package.json";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [revision, setRevision] = useState(`v${packageInfo.version}`);
  useEffect(() => {
    const stamp = document
      .querySelector('meta[name="desk-revision"]')
      ?.getAttribute("content");
    if (stamp) setRevision(stamp);
  }, []);
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-semibold">The report desk could not open</h1>
      <p className="text-sm text-muted-foreground">The server could not load this page. Retry, or ask Admin to check the shared database connection. Saved device drafts are retained.</p>
      {error.digest && <p className="text-xs text-muted-foreground">Support reference: {error.digest}</p>}
      <p className="text-xs text-muted-foreground">Build {revision}</p>
      <a href="/offline" className="text-sm underline">Open device drafts</a>
      <Button type="button" className="w-fit" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
