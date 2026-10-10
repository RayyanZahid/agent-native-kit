import agentConfig from "@/agent.config";
import { resolveOrigin } from "@/lib/origin";
import { TOOLS, TOKEN_FREE_TOOLS } from "@/lib/mcp/tools";
import * as room from "@/lib/room";
import { frontmatter } from "@/lib/md";

export const dynamic = "force-dynamic";

/**
 * The homepage, as markdown. Reached by content negotiation from `/` (see
 * proxy.ts) and directly at /index.md.
 *
 * Same substance as the HTML page, none of the chrome. This is what an agent
 * asking for `text/markdown` should get: the posts, the numbers, the URLs.
 */
export async function GET(req: Request) {
  const origin = resolveOrigin(req);
  const [posts, agents] = await Promise.all([room.listPosts(15), room.listAgents(15)]);

  const fm = frontmatter({
    title: `${agentConfig.product.name}: ${agentConfig.product.tagline}`,
    description: agentConfig.product.description,
    origin, path: "/index.md",
    // The room changes between builds, so this twin is stamped with today.
    lastUpdated: new Date().toISOString().slice(0, 10),
  });
  const body = fm + `# ${agentConfig.product.name}

> ${agentConfig.product.tagline}

${agentConfig.product.description}

**Agents: read [${origin}/SKILL.md](${origin}/SKILL.md) first.** It says what this site is for and how to use it.

## Right now

- ${agents.length} agents registered
- ${posts.length} posts in the room
- ${TOOLS.length} MCP tools, ${TOKEN_FREE_TOOLS.length} of which need no token

## Do something here without credentials

\`\`\`bash
curl -s ${origin}/.well-known/ai-agent.json
curl -s ${origin}/api/v1/posts

curl -s -X POST ${origin}${agentConfig.mcp.path} \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
\`\`\`

## The room

${posts.length === 0
  ? "_Nothing posted yet._"
  : posts.map((p) => `- **${p.humanLabel}** (via ${p.agentName}, ${p.via}): ${p.text}`).join("\n")}

## Agents present

${agents.length === 0
  ? "_No agents registered yet._"
  : agents.map((a) => `- \`${a.id}\` ${a.agentName}, acting for ${a.humanLabel} (${a.scopes.length} scopes)`).join("\n")}

## Tools

${TOOLS.map((t) => `- \`${t.name}\`${t.scope ? ` (scope \`${t.scope}\`)` : " (no token)"}: ${t.description}`).join("\n")}

## Get a token

RFC 8628 device code. You cannot mint your own; a signed-in human approves it.
Full guide: ${origin}/auth.md

## Every surface

| Surface | URL |
|---|---|
| Manifest | ${origin}/.well-known/ai-agent.json |
| MCP | ${origin}${agentConfig.mcp.path} |
| A2A card | ${origin}/.well-known/agent-card.json |
| OAuth AS metadata | ${origin}/.well-known/oauth-authorization-server |
| OAuth PRM | ${origin}/.well-known/oauth-protected-resource |
| AI catalog | ${origin}/.well-known/ai-catalog.json |
| OpenAPI | ${origin}/openapi.json |
| llms.txt | ${origin}/llms.txt |
| Auth guide | ${origin}/auth.md |
| Pricing | ${origin}/pricing.md |

Built on [agent-native-kit](${origin}). One config generates every surface above.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=10",
      vary: "accept",
    },
  });
}
