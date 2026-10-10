import { GET as cardGET } from "@/app/.well-known/agent-card.json/route";
import { resolveOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/**
 * THE A2A ENDPOINT THE CARD ADVERTISES.
 *
 * agent-card.json and ai-agent.json both publish `${origin}/api/a2a` as the A2A
 * url. Messages are routed per agent (/api/a2a/<agentId>, see [agent]/route.ts),
 * so for a while this exact URL answered 404 while two discovery documents
 * promised it. A card that validates and an endpoint that does not exist is the
 * worst kind of drift: every static check passes. scripts/verify.sh now POSTs
 * here, so that cannot happen quietly again.
 *
 * What lives here: `agent/getCard` (public, returns the site card as the
 * JSON-RPC result) and a directory on GET. `message/send` is refused with the
 * address to use instead.
 */
const CORS = { "access-control-allow-origin": "*" };

export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return Response.json({
    protocol: "a2a",
    transport: "JSONRPC",
    note: "POST JSON-RPC here for agent/getCard. Send messages to a specific agent at /api/a2a/<agentId>.",
    card: `${origin}/.well-known/agent-card.json`,
    agents: `${origin}/api/v1/agents`,
    try_this: { jsonrpc: "2.0", id: 1, method: "agent/getCard" },
  }, { headers: CORS });
}

export async function POST(req: Request) {
  const origin = resolveOrigin(req);
  const body = await req.json().catch(() => null) as { method?: string; id?: unknown } | null;
  if (!body) return rpc(null, { code: -32700, message: "Parse error" }, 400);

  if (body.method === "agent/getCard") {
    const card = await (cardGET(req) as Response).json();
    return rpc(body.id, undefined, 200, card);
  }
  if (body.method === "message/send") {
    return rpc(body.id, {
      code: -32602,
      message: `message/send needs a recipient. POST it to ${origin}/api/a2a/<agentId> (ids: ${origin}/api/v1/agents).`,
    }, 400);
  }
  return rpc(body.id, {
    code: -32601,
    message: `Method not found: ${body.method}. This endpoint supports agent/getCard; message/send goes to /api/a2a/<agentId>.`,
  }, 400);
}

function rpc(id: unknown, error?: { code: number; message: string }, status = 200, result?: unknown) {
  return Response.json(
    error ? { jsonrpc: "2.0", id: id ?? null, error } : { jsonrpc: "2.0", id: id ?? null, result },
    { status, headers: CORS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    ...CORS, "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type" } });
}
