/**
 * Frontmatter for every markdown document the site serves.
 *
 * An agent that fetches /auth.md or /SKILL.md gets title, description,
 * canonical URL and a freshness date from the first lines, without scraping
 * the body to work out what the document is or whether it is current. Served
 * markdown without it is the 12th-century equivalent of an unlabelled jar.
 *
 * `last-updated` is the BUILD date (next.config.ts bakes it in), which is the
 * truth for documents generated from config. Pass `lastUpdated` for a document
 * whose content changes between builds (the homepage twin).
 */
export function frontmatter(opts: {
  title: string;
  description: string;
  origin: string;
  path: string;
  lastUpdated?: string;
  extra?: Record<string, string>;
}): string {
  const date = opts.lastUpdated ?? process.env.BUILD_DATE ?? new Date().toISOString().slice(0, 10);
  const q = (v: string) => JSON.stringify(v.replace(/\s+/g, " ").trim());
  const lines = [
    "---",
    ...Object.entries(opts.extra ?? {}).map(([k, v]) => `${k}: ${q(v)}`),
    `title: ${q(opts.title)}`,
    `description: ${q(opts.description)}`,
    `canonical: ${q(`${opts.origin}${opts.path}`)}`,
    `last-updated: ${date}`,
    "---",
    "",
    "",
  ];
  return lines.join("\n");
}
