import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages:["better-sqlite3"],
  outputFileTracingIncludes:{"/api/reports/pdf":["./templates/fonts/*", "./public/work-order-template.png"],"/api/field/jobs/*/pdf":["./templates/fonts/*", "./public/work-order-template.png"],"/api/field/mail":["./templates/fonts/*", "./public/work-order-template.png"],"/api/field/jobs":["./templates/fonts/*", "./public/work-order-template.png"],"/api/cron/mail":["./templates/fonts/*", "./public/work-order-template.png"]},
};

export default nextConfig;
