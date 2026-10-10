import agentConfig from "@/agent.config";
import { resolveOrigin, discoveryJson } from "@/lib/origin";
import { mcpInstructions, publicToolList, TOKEN_FREE_TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

/**
 * MCP SERVER CARD. A client reads this BEFORE connecting: who runs the server,
 * how to reach it, whether it needs auth, and what the tools are and do. It is
 * the MCP equivalent of the A2A agent card, and a server that only answers
 * `initialize` makes a client connect blind just to find out.
 *
 * Generated from the same TOOLS array the server serves, so the card cannot
 * list a tool (or an annotation) the server does not have. Discovered from
 * /.well-known/mcp.json and /.well-known/ai-catalog.json as well as this path.
 */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return discoveryJson({
    name: agentConfig.product.slug,
    title: agentConfig.product.name,
    version: agentConfig.product.version,
    description: agentConfig.product.description,
    protocolVersion: agentConfig.mcp.protocolVersion,
    serverInfo: { name: agentConfig.product.name, version: agentConfig.product.version },
    documentationUrl: `${origin}/auth.md`,
    homepage: origin,
    provider: { name: agentConfig.product.author, url: origin },
    transport: { type: "streamable-http", endpoint: `${origin}${agentConfig.mcp.path}` },
    instructions: mcpInstructions(origin),
    capabilities: { tools: { listChanged: false } },
    authentication: {
      required: false,
      note: `${TOKEN_FREE_TOOLS.length} tools need no token. The rest need a human-approved bearer token.`,
      schemes: ["bearer"],
      protectedResourceMetadata: `${origin}/.well-known/oauth-protected-resource/api/mcp`,
      guide: `${origin}/auth.md`,
    },
    tools: publicToolList(),
  });
}
