import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ReportNotFound() {
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-semibold">That report is not saved</h1>
      <p className="text-sm text-muted-foreground">
        It may have been deleted. The other months are still on the desk.
      </p>
      <Link href="/" className={cn(buttonVariants(), "w-fit")}>
        Back to reports
      </Link>
    </main>
  );
}
