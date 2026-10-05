import { MasterList } from "@/components/master-list";
import { listWorkEntries } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MasterPage() {
  const entries = await listWorkEntries();
  return <MasterList entries={entries} />;
}
