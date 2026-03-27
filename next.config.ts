import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    // Turbopack dev persistence: avoids concurrent write/compaction errors (e.g. "Another write batch...")
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
