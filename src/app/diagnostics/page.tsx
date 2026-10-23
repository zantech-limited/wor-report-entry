import type { Metadata } from "next";
import { DiagnosticsPanel } from "@/components/diagnostics-panel";
import { adminTokenConfigured } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Connection diagnostics",
  robots: { index: false, follow: false },
};

export default function DiagnosticsPage() {
  if (!adminTokenConfigured()) {
    return (
      <section className="mx-auto grid max-w-lg gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin connection diagnostics</h1>
        <p>
          ADMIN_TOKEN is not set for this deployment. Add ADMIN_TOKEN in the Vercel
          environment that serves this URL. Production and Preview are separate, so a
          token saved only for Production does not unlock Preview.
        </p>
        <p>
          Redeploy after saving the variable. Until then this page cannot be unlocked,
          and there is no database sign-in that can open these diagnostics.
        </p>
        <a className="underline" href="/login">
          Back to sign in
        </a>
      </section>
    );
  }
  return <DiagnosticsPanel />;
}
