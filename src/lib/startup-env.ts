export type DeploymentCheck = { blocking: string[]; warnings: string[] };

/** Names of missing or unusable Vercel settings. Values are never included. */
export function deploymentCheck(): DeploymentCheck {
  if (!process.env.VERCEL) return { blocking: [], warnings: [] };
  const blocking: string[] = [];
  const warnings: string[] = [];
  const app = process.env.APP_URL || "";
  let originOk = false;
  try {
    const url = new URL(app);
    originOk =
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "";
  } catch {
    originOk = false;
  }
  if (!originOk) blocking.push("APP_URL");
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
    blocking.push("AUTH_SECRET");
  const engine = process.env.DB_ENGINE || "";
  if (!["postgres", "supabase", "mysql"].includes(engine))
    blocking.push("DB_ENGINE");
  for (const name of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const)
    if (!process.env[name]?.trim()) blocking.push(name);
  const port = Number(process.env.DB_PORT);
  if (!process.env.DB_PORT || !Number.isInteger(port) || port < 1 || port > 65535)
    blocking.push("DB_PORT");
  if (engine === "supabase" && process.env.DB_TLS !== "true")
    blocking.push("DB_TLS");
  if (!process.env.CRON_SECRET) warnings.push("CRON_SECRET");
  if (!process.env.ADMIN_TOKEN) warnings.push("ADMIN_TOKEN");
  return { blocking, warnings };
}
