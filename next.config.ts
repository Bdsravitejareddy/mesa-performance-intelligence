import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdfjs-dist"],
  // PDF.js imports its worker dynamically, so static serverless tracing misses it.
  outputFileTracingIncludes: {
    "/api/drive-agent/finalize": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/materials/extract": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/imports/nexus-submission": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/lms-sync": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/cron/lms-sync": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/submissions/[id]/documents": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  turbopack: { root: process.cwd() },
  // Keep visited and prefetched pages in the browser briefly so moving between chapters is instant.
  experimental: { staleTimes: { dynamic: 60, static: 300 } },
};

export default nextConfig;
