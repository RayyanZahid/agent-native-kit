import { resolveOrigin, discoveryJson } from "@/lib/origin";
import { SCOPES } from "@/lib/scopes";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 Protected Resource Metadata.
 *
 * `scopes_supported` is SOURCED from the vocabulary, never hand-listed. Hand
 * listing is how a PRM ends up advertising a scope tokens cannot carry, or
 * omitting one they can, and nothing fails loudly when it does.
 *
 * RFC 9728 §3.1 makes `scopes_supported` optional. Ship it anyway: consumers
 * that branch on advertised scopes require it.
 */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return discoveryJson({
    resource: origin,
    authorization_servers: [origin],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/auth.md`,
  });
}
