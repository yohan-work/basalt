import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Avoid shipping browser source maps in production (smaller deploy, no accidental source exposure). */
  productionBrowserSourceMaps: false,
  reactCompiler: true,
  experimental: {
    // Turbopack dev persistence: avoids concurrent write/compaction errors (e.g. "Another write batch...")
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
