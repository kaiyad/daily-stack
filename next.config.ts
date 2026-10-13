import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: { optimizePackageImports: [] },
  serverExternalPackages: ["pg"],
};

export default config;
