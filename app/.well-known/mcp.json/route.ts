import agentConfig from "@/agent.config";
import { resolveOrigin, discoveryJson } from "@/lib/origin";
import { TOOLS, TOKEN_FREE_TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return discoveryJson({
    name: agentConfig.product.name,
    description: agentConfig.product.tagline,
    version: agentConfig.product.version,
    protocolVersion: agentConfig.mcp.protocolVersion,
    // `serverInfo` mirrors what the MCP `initialize` response returns. A
    // validator that had `name` at the top level still failed this card for
    // wanting serverInfo.name, so ship both rather than reasoning about which
    // one a given client reads.
    serverInfo: {
      name: agentConfig.product.name,
      version: agentConfig.product.version,
      description: agentConfig.product.tagline,
    },
    url: `${origin}${agentConfig.mcp.path}`,
    transport: "streamable-http",
    servers: [{
      name: agentConfig.product.slug,
      url: `${origin}${agentConfig.mcp.path}`,
      transport: "streamable-http",
      protocol_version: agentConfig.mcp.protocolVersion,
      authentication: { type: "oauth2", flow: "device_code", metadata: `${origin}/.well-known/oauth-protected-resource` },
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, requires_auth: t.scope !== null })),
      anonymous_tools: TOKEN_FREE_TOOLS.map((t) => t.name),
    }],
  });
}
