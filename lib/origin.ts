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
    warnFallback(host);
    return agentConfig.hosts.canonical;
  }
  const scheme = host.startsWith("localhost") ? "http" : "https";
  return `${scheme}://${host}`;
}

const warned = new Set<string>();

/**
 * The fallback is the right security behaviour and a confusing developer
 * experience: run on another port or a Vercel preview URL and every discovery
 * doc silently points at the canonical site. Keep the behaviour, make it loud.
 * Logged once per host so a scanner cannot flood the log.
 */
function warnFallback(host: string) {
  if (warned.has(host) || warned.size > 100) return;
  warned.add(host);
  console.warn(
    `[agent-native-kit] Host "${host}" is not in agent.config.ts hosts.allowed, so discovery ` +
    `documents are using the canonical origin ${agentConfig.hosts.canonical} instead. ` +
    `Add "${host}" to hosts.allowed (port included, e.g. "localhost:3199") and rebuild.`,
  );
}

/** Header value for a request whose Host fell back, or null when it did not.
 *  Used by middleware so the fallback is visible on the wire, not only in logs. */
export function originFallbackNote(host: string | null): string | null {
  const h = (host || "").toLowerCase().trim();
  if (!h || (agentConfig.hosts.allowed as readonly string[]).includes(h)) return null;
  return `host "${h}" is not in agent.config.ts hosts.allowed; discovery documents reference ${agentConfig.hosts.canonical}`;
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
