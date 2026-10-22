import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages:["better-sqlite3"],
  outputFileTracingIncludes:{"/api/reports/pdf":["./templates/fonts/*"],"/api/field/jobs/*/pdf":["./templates/fonts/*"],"/api/field/mail":["./templates/fonts/*"],"/api/field/jobs":["./templates/fonts/*"],"/api/cron/mail":["./templates/fonts/*"]},
};

export default nextConfig;
