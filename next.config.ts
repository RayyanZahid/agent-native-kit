import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Discovery documents are fetched cross-origin by scanners and agent clients.
  // Served bytes are what gets graded, so nothing here may be client-only.
  async headers() {
    return [
      {
        source: "/.well-known/:path*",
        headers: [
          { key: "access-control-allow-origin", value: "*" },
          { key: "cache-control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
