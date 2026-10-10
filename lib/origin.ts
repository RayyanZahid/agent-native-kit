import agentConfig from "@/agent.config";

/**
 * Resolve the origin to self-reference in a discovery document.
 *
 * THE TRAP THIS CLOSES (it cost a real campaign a wave): if a site answers on
 * both an apex and a www host and its metadata hardcodes one of them, a scanner
 * fetching the OTHER host reads self-references pointing somewhere else. It then
 * fetches authorization-server metadata from a different origin than the
 * /auth.md it just canonicalised, and the discovery check fails in a way that
 * looks exactly like an auth bug and is not one.
 *
 * Reflect the request's Host, but ONLY from the allow-list. An unknown or
 * spoofed Host falls back to canonical, so this can never become an open
 * redirect for our own discovery documents.
 */
export function resolveOrigin(req: Request): string {
  const host = (req.headers.get("host") || "").toLowerCase().trim();
  if (!agentConfig.hosts.allowed.includes(host as never)) {
    return agentConfig.hosts.canonical;
  }
  const scheme = host.startsWith("localhost") ? "http" : "https";
  return `${scheme}://${host}`;
}

/** Standard headers for any discovery document. */
export const discoveryHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=3600",
} as const;

export function discoveryJson(body: unknown) {
  return new Response(JSON.stringify(body, null, 2), { headers: discoveryHeaders });
}
