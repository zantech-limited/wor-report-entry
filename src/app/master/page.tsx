import { MasterList } from "@/components/master-list";
import { listWorkEntries } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MasterPage({searchParams}: {searchParams: Promise<Record<string,string|undefined>>}) {
  const entries = await listWorkEntries();
  const filters=await searchParams;
  return <MasterList key={JSON.stringify(filters)} entries={entries} initialFilters={filters} />;
}
