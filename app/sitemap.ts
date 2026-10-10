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
    { url: `${b}/approve`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
