import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ line?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const line = query.line ? `&line=${encodeURIComponent(query.line)}` : "";
  redirect(`/?report=${encodeURIComponent(id)}${line}`);
}
