import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: repoRoot,
  },
  serverExternalPackages: ["square", "twilio"],
};

export default nextConfig;
