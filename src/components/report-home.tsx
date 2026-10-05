import { MonthActions } from "@/components/month-actions";

export function ReportHome() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Entry</h1>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        No months saved yet. Import the August workbook, or start a blank month and type the first work order.
        Saved reports stay on this machine.
      </p>
      <MonthActions />
    </div>
  );
}
