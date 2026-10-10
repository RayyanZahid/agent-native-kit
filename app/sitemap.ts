import type { MetadataRoute } from "next";
import agentConfig from "@/agent.config";

/**
 * A sitemap, because robots.txt ADVERTISES one.
 *
 * The scanner caught this: we promised `Sitemap:` and served a 404. Promising a
 * surface you do not serve is worse than omitting it, because a client that
 * trusts the advertisement wastes a request and learns our metadata lies.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const b = agentConfig.hosts.canonical;
  const now = new Date();
  return [
    { url: `${b}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${b}/developers`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${b}/auth.md`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${b}/llms.txt`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${b}/pricing.md`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${b}/index.md`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${b}/SKILL.md`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${b}/openapi.json`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    // The agent files. A crawler that trusts the sitemap should find these.
    ...[
      "/.well-known/ai-agent.json", "/.well-known/agent-card.json", "/.well-known/mcp.json",
      "/.well-known/mcp/server-card.json", "/.well-known/ai-catalog.json", "/.well-known/api-catalog",
      "/.well-known/agent-skills/index.json", "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server", agentConfig.mcp.path,
    ].map((path) => ({ url: `${b}${path}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 })),
    // /approve is deliberately absent: it is a human sign-in page, not content.
  ];
}
