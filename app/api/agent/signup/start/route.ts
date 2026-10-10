import { startDeviceFlow } from "@/lib/device";
import { resolveOrigin } from "@/lib/origin";
import { problem } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Anonymous. An agent asks for scopes; it gets a code, never a token. */
export async function POST(req: Request) {
  const origin = resolveOrigin(req);
  const body = await req.json().catch(() => null) as { scopes?: unknown; agent_name?: unknown } | null;

  if (!body || !Array.isArray(body.scopes) || body.scopes.length === 0) {
    return problem("invalid_request", "Missing scopes.",
      `POST {"scopes":["read:public","posts:read","posts:write"],"agent_name":"your name"}. Vocabulary at ${origin}/.well-known/oauth-protected-resource`);
  }

  const out = await startDeviceFlow(
    body.scopes.map(String),
    typeof body.agent_name === "string" ? body.agent_name : "unnamed agent",
    origin,
  );

  if (!out.ok) {
    return problem("invalid_request", "One or more scopes are not grantable.",
      `Remove these and retry: ${out.ungranted.join(", ")}. Valid scopes: ${origin}/.well-known/oauth-protected-resource`,
      { ungranted: out.ungranted });
  }

  const { ok: _ok, ...flow } = out;
  return Response.json(
    { ...flow, next: "Show your human verification_uri_complete, then poll the poll endpoint every 3 seconds." },
    { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type" } });
}
