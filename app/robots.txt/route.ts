import { resolveOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/**
 * Agent-aware robots.txt.
 *
 * The decision encoded here: AI crawlers are ALLOWED. Blocking them is the
 * default a lot of sites drifted into by copying a 2024 robots.txt, and it is
 * the single most effective way to make yourself invisible to the surfaces that
 * now recommend products. If you genuinely want to opt out, change it here, on
 * purpose, rather than inheriting it.
 */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  const bots = [
    "GPTBot", "OAI-SearchBot", "ChatGPT-User",
    "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
    "PerplexityBot", "Perplexity-User", "Google-Extended",
    "Applebot-Extended", "CCBot", "meta-externalagent", "Bytespider",
  ];
  const body = `# Humans and agents are both welcome here.
# Agent entry point: ${origin}/.well-known/ai-agent.json

User-agent: *
Allow: /

${bots.map((b) => `User-agent: ${b}\nAllow: /`).join("\n\n")}

# Discovery surfaces, explicitly allowed
Allow: /.well-known/
Allow: /llms.txt
Allow: /auth.md
Allow: /openapi.json

Sitemap: ${origin}/sitemap.xml
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
