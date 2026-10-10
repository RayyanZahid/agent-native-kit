import { kvConfigured } from "@/lib/store";
import { TOOLS, TOKEN_FREE_TOOLS } from "@/lib/mcp/tools";
import agentConfig from "@/agent.config";

export const dynamic = "force-dynamic";

/**
 * Health. Reports the DEGRADED state honestly rather than returning a green
 * 200 with a lie in it: without KV, writes vanish between invocations, and a
 * health check that does not say so is worse than no health check.
 */
export function GET() {
  const ok = kvConfigured;
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      version: agentConfig.product.version,
      storage: kvConfigured ? "kv" : "in-process-memory",
      ...(ok ? {} : { warning: "No KV configured. Writes will not persist across serverless invocations. Set KV_REST_API_URL and KV_REST_API_TOKEN." }),
      tools: { total: TOOLS.length, token_free: TOKEN_FREE_TOOLS.length },
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } },
  );
}
