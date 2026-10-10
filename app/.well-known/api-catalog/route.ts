import agentConfig from "@/agent.config";
import { resolveOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/** RFC 9727 api-catalog, served as `application/linkset+json`. The media type
 *  is part of the contract; serving this as plain JSON fails the check. */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return new Response(
    JSON.stringify({
      linkset: [{
        anchor: origin,
        "service-desc": [
          { href: `${origin}/openapi.json`, type: "application/json", title: "OpenAPI 3.1 description" },
        ],
        "service-doc": [
          { href: `${origin}/developers`, type: "text/html", title: "Developer portal" },
          { href: `${origin}/auth.md`, type: "text/markdown", title: "Agent authentication guide" },
        ],
        "service-meta": [
          { href: `${origin}/.well-known/ai-agent.json`, type: "application/json", title: "Agent manifest" },
          { href: `${origin}/.well-known/mcp.json`, type: "application/json", title: "MCP discovery" },
        ],
        status: [{ href: `${origin}/api/v1/health`, type: "application/json", title: "Health" }],
      }],
      api_base: `${origin}${agentConfig.api.basePath}`,
    }, null, 2),
    { headers: { "content-type": "application/linkset+json", "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" } },
  );
}
