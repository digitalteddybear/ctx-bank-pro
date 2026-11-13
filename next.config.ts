import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  distDir: process.env.CTX_BUILD_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
  },
};

export default nextConfig;
