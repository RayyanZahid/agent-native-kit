import agentConfig from "@/agent.config";
import { resolveOrigin, discoveryJson } from "@/lib/origin";
import { TOOLS, TOKEN_FREE_TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

/** ARD capability manifest. Discovered three ways (robots.txt Agentmap, a
 *  <link rel="ai-catalog"> in head, and this well-known path) because a
 *  discovery surface reachable only one way is a discovery surface that breaks. */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return discoveryJson({
    // `specVersion` identifies the ARD SPEC; `version` identifies OUR catalog.
    // The scanner asked for specVersion by name and a document carrying only
    // `version` read as malformed rather than as an old version.
    specVersion: "1.0",
    version: agentConfig.product.version,
    name: agentConfig.product.name,
    description: agentConfig.product.description,
    homepage: origin,
    capabilities: TOOLS.map((t) => ({
      id: t.name,
      name: t.name,
      description: t.description,
      interface: "mcp",
      endpoint: `${origin}${agentConfig.mcp.path}`,
      auth: t.scope ? { required: true, scope: t.scope } : { required: false },
    })),
    interfaces: [
      { type: "mcp", url: `${origin}${agentConfig.mcp.path}`, transport: "streamable-http" },
      { type: "a2a", url: `${origin}${agentConfig.a2a.path}`, card: `${origin}/.well-known/agent-card.json` },
      { type: "rest", url: `${origin}${agentConfig.api.basePath}`, openapi: `${origin}/openapi.json` },
    ],
    anonymous_capabilities: TOKEN_FREE_TOOLS.map((t) => t.name),
    auth: {
      type: "oauth2-device-code",
      metadata: `${origin}/.well-known/oauth-authorization-server`,
      documentation: `${origin}/auth.md`,
    },
    pricing: { model: agentConfig.pricing.model, document: `${origin}/pricing.md` },
  });
}
