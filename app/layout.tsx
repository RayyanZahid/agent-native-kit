import type { Metadata } from "next";
import agentConfig from "@/agent.config";
import { WebMcpInline } from "@/app/WebMcpInline";
import "./globals.css";

const SITE = agentConfig.hosts.canonical;
const TITLE = `${agentConfig.product.name}: ${agentConfig.product.tagline}`;

/**
 * Truthful structured data, generated from the config. SoftwareApplication
 * says what the product is; Organization says who publishes it. Linked by
 * @id so a consumer resolves one entity graph rather than two loose objects.
 * Nothing here is invented: every value is a config field.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#app`,
      name: agentConfig.product.name,
      description: agentConfig.product.description,
      url: SITE,
      applicationCategory: agentConfig.product.category,
      operatingSystem: "Web",
      softwareVersion: agentConfig.product.version,
      license: agentConfig.product.license,
      publisher: { "@id": `${SITE}/#org` },
      ...(agentConfig.pricing.model === "free"
        ? { offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }
        : {}),
    },
    { "@type": "Organization", "@id": `${SITE}/#org`, name: agentConfig.product.author, url: SITE },
    { "@type": "WebSite", "@id": `${SITE}/#site`, name: agentConfig.product.name, url: SITE, publisher: { "@id": `${SITE}/#org` } },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: agentConfig.product.description,
  alternates: { canonical: "/" },
  // og:image comes from app/opengraph-image.tsx (Next adds the tags).
  openGraph: {
    type: "website",
    url: SITE,
    siteName: agentConfig.product.name,
    title: TITLE,
    description: agentConfig.product.description,
  },
  other: {
    // Discovery hints in the served <head>. A crawler that never reads
    // /.well-known still finds the manifest from here.
    "ai-agent-manifest": "/.well-known/ai-agent.json",
    "mcp-server": agentConfig.mcp.path,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* RFC 8288 Link rels. Part of the api-catalog check, and genuinely
            useful: a client finds the spec without a second fetch. */}
        <link rel="service-desc" href="/openapi.json" type="application/json" />
        <link rel="service-doc" href="/auth.md" type="text/markdown" />
        <link rel="service-meta" href="/.well-known/ai-agent.json" type="application/json" />
        <link rel="api-catalog" href="/.well-known/api-catalog" type="application/linkset+json" />
        <link rel="ai-catalog" href="/.well-known/ai-catalog.json" type="application/json" />
        <link rel="describedby" href="/SKILL.md" type="text/markdown" />
        <link rel="describedby" href="/llms.txt" type="text/plain" />
        <link rel="alternate" href="/index.md" type="text/markdown" />
      </head>
      <body>
        <script
          type="application/ld+json"
          // Built from config at module scope; "<" escaped so no field can close the tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
        />
        {children}
        <WebMcpInline />
      </body>
    </html>
  );
}
