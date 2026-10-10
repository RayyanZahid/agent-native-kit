import { resolveOrigin, discoveryJson } from "@/lib/origin";
import agentConfig from "@/agent.config";
import { SCOPES } from "@/lib/scopes";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 §3.1 PATH INSERTION. Do not delete this route thinking it duplicates
 * the root one.
 *
 * A strict MCP client that gets a 401 from /api/mcp derives the metadata URL
 * /.well-known/oauth-protected-resource/api/mcp — note the path appended AFTER
 * the well-known segment. Ship only the root document and that client gets a
 * 404 and therefore no path to auth at all. It does not fall back.
 *
 * `resource` here is the MCP endpoint, not the site root. That is the whole
 * point of the path-inserted variant.
 */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return discoveryJson({
    resource: `${origin}${agentConfig.mcp.path}`,
    authorization_servers: [origin],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/auth.md`,
  });
}
