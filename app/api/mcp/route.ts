import agentConfig from "@/agent.config";
import { agentGate, hasScope } from "@/lib/auth";
import { findTool, mcpInstructions, publicToolList } from "@/lib/mcp/tools";
import { checkRate, rateHeaders } from "@/lib/ratelimit";
import { resolveOrigin } from "@/lib/origin";
import * as room from "@/lib/room";

export const dynamic = "force-dynamic";

/**
 * MCP server, Streamable HTTP. One route handles the whole protocol.
 *
 * STDIO IS NOT AN OPTION IN PRODUCTION. It is a local-dev transport; a hosted
 * client cannot reach it at all. If a tutorial gave you a stdio server and told
 * you to deploy it, that tutorial was written for your laptop.
 *
 * THE DESIGN DECISION WORTH COPYING: `initialize` and `tools/list` are
 * ANONYMOUS, and `tools/call` is anonymous for any tool whose scope is null.
 * An agent can therefore discover this server, read its whole tool catalog, and
 * do genuinely useful work before any human has approved anything. That is what
 * makes the product evaluable. Gate the writes, never the catalog.
 */
export async function POST(req: Request) {
  const origin = resolveOrigin(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return rpcError(null, -32700, "Parse error");

  const { method, params, id } = body as { method?: string; params?: any; id?: unknown };

  if (method === "initialize") {
    return rpcOk(id, {
      protocolVersion: agentConfig.mcp.protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: agentConfig.product.name, version: agentConfig.product.version },
      instructions: mcpInstructions(origin),
    });
  }

  // Notifications carry no id and expect no response body.
  if (method === "notifications/initialized") return new Response(null, { status: 202 });

  if (method === "tools/list") return rpcOk(id, { tools: publicToolList() });

  if (method !== "tools/call") return rpcError(id, -32601, `Method not found: ${method}`);

  const name = params?.name as string | undefined;
  const input = (params?.arguments ?? {}) as Record<string, unknown>;
  const tool = name ? findTool(name) : undefined;
  if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);

  // Anonymous path: a token-free tool runs with no gate at all.
  if (tool.scope === null) {
    try {
      const result = await tool.handler({ agent: null, origin, via: "mcp" }, input);
      return rpcOk(id, content(result));
    } catch (e) {
      return rpcError(id, -32603, String(e instanceof Error ? e.message : e));
    }
  }

  const gate = await agentGate(req);
  if (!gate.ok) {
    return rpcError(
      id, -32001,
      `${gate.message} This tool needs scope "${tool.scope}". Get a human-approved token: ${origin}/auth.md`,
    );
  }

  if (!hasScope(gate.agent.scopes, tool.scope)) {
    return rpcError(
      id, -32003,
      `Your token lacks scope "${tool.scope}". It holds: ${gate.agent.scopes.join(", ") || "none"}. ` +
      `Scopes are frozen at mint time, so mint a new token with this scope rather than trying to widen this one: ${origin}/auth.md`,
    );
  }

  const rl = await checkRate(gate.agent.id, tool.rateClass);
  if (!rl.ok) {
    return rpcError(id, -32004, `Rate limit for "${tool.rateClass}" reached. Resets in ${rl.reset}s.`, rateHeaders(rl));
  }

  // Keep the agent roster fresh so floor_list_agents shows whoever is active.
  room.registerAgent({
    id: gate.agent.id, agentName: gate.agent.agentName,
    humanLabel: gate.agent.humanLabel, scopes: gate.agent.scopes,
    createdAt: gate.agent.createdAt,
  }).catch(() => {});

  try {
    const result = await tool.handler({ agent: gate.agent, origin, via: "mcp" }, input);
    return rpcOk(id, content(result), rateHeaders(rl));
  } catch (e) {
    return rpcError(id, -32603, String(e instanceof Error ? e.message : e), rateHeaders(rl));
  }
}

/** GET on the MCP path is a human or a confused client. Tell it where to go
 *  rather than returning a bare 405 with no information. */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return Response.json({
    name: agentConfig.product.name,
    transport: "streamable-http",
    note: "POST JSON-RPC here. This endpoint speaks MCP, not REST.",
    protocolVersion: agentConfig.mcp.protocolVersion,
    try_this: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    docs: `${origin}/auth.md`,
    discovery: `${origin}/.well-known/mcp.json`,
  }, { headers: { "access-control-allow-origin": "*" } });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
    },
  });
}

function content(result: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

function rpcOk(id: unknown, result: unknown, extra: Record<string, string> = {}) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result },
    { headers: { "access-control-allow-origin": "*", ...extra } });
}

function rpcError(id: unknown, code: number, message: string, extra: Record<string, string> = {}) {
  const status = code === -32001 ? 401 : code === -32003 ? 403 : code === -32004 ? 429 : 400;
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    {
      status,
      headers: {
        "access-control-allow-origin": "*",
        // RFC 9728: a 401 from a protected resource MUST point at its metadata,
        // or a strict client has no way to discover how to authenticate.
        ...(status === 401 ? { "www-authenticate": `Bearer resource_metadata="/.well-known/oauth-protected-resource/api/mcp"` } : {}),
        ...extra,
      },
    });
}
