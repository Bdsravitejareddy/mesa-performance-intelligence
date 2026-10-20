import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdfjs-dist"],
  // PDF.js imports its worker dynamically, so static serverless tracing misses it.
  outputFileTracingIncludes: {
    "/api/drive-agent/finalize": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/materials/extract": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
