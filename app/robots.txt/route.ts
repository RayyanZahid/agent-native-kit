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

# Content Signals - declare AI content usage preferences
# See https://contentsignals.org/ and
# https://datatracker.ietf.org/doc/draft-romm-aipref-contentsignals/
#
# These express INTENT about how our content may be used, separately from
# whether a crawler may fetch it. Stating them is the point: silence is not
# consent, it is ambiguity, and ambiguity gets resolved in whatever direction
# the crawler prefers. The VALUES below are a choice; change them on purpose.
#
# Emitted BOTH as a global directive and inside the User-Agent group, because
# real passers in the wild do it both ways and a parser that only looks in one
# place reports "no Content Signals found" while the line is plainly on the
# wire. Three guesses at the format cost more than emitting both forms.
Content-Signal: ai-train=no, search=yes, ai-input=yes

User-Agent: *
Content-Signal: ai-train=no, search=yes, ai-input=yes
Allow: /

${bots.map((b) => `User-agent: ${b}\nAllow: /`).join("\n\n")}

# Discovery surfaces, explicitly allowed
Allow: /.well-known/
Allow: /llms.txt
Allow: /auth.md
Allow: /openapi.json

Sitemap: ${origin}/sitemap.xml
Agentmap: ${origin}/.well-known/ai-catalog.json
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=60, must-revalidate" },
  });
}
