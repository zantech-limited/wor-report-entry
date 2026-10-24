import type { NextConfig } from "next";

const tracedFiles = [
  "./templates/*.xlsm",
  "./templates/fonts/*",
  "./public/work-order-template.png",
  "./public/icons/zantech-logo.png",
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // `*` matches every App Router page and route, including `/`.
  // The workbook path is built from process.cwd(), so the tracer does not follow it.
  outputFileTracingIncludes: {
    "*": tracedFiles,
  },
};

export default nextConfig;
