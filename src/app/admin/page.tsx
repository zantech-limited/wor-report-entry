import { AdminPanel } from "@/components/admin-panel";
export const dynamic = "force-dynamic";
import {FieldTeam} from "@/components/field-team";
export default function AdminPage() { return <><AdminPanel /><div className="mx-auto max-w-6xl px-4 pb-8"><FieldTeam/></div></>; }
