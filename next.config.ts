import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdfjs-dist"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
