import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Discovery documents are fetched cross-origin by scanners and agent clients.
  // Served bytes are what gets graded, so nothing here may be client-only.
  async headers() {
    return [
      {
        // HTTP `Link:` headers, not just <link> tags in <head>.
        // The scanner reads the HEADER: our head tags were correct and the
        // check still failed with "Link headers present but no agent-useful
        // relation types found", because Next's own preload Link was the only
        // header on the response. Both surfaces, same rels.
        source: "/",
        headers: [
          {
            key: "link",
            value: [
              '</openapi.json>; rel="service-desc"; type="application/json"',
              '</auth.md>; rel="service-doc"; type="text/markdown"',
              '</.well-known/ai-agent.json>; rel="service-meta"; type="application/json"',
              '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
              '</llms.txt>; rel="describedby"; type="text/plain"',
              '</index.md>; rel="alternate"; type="text/markdown"',
            ].join(", "),
          },
          { key: "vary", value: "accept" },
        ],
      },
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
