import { resolveOrigin, discoveryJson } from "@/lib/origin";
import { SCOPES } from "@/lib/scopes";

export const dynamic = "force-dynamic";

/**
 * RFC 8414 Authorization Server Metadata.
 *
 * The PRM (RFC 9728) says "here is the authorization server for this resource."
 * THIS document is what that pointer has to resolve to. Shipping the PRM alone
 * leaves a client holding a URL it cannot do anything with, which is how a
 * discovery chain breaks one link from the end.
 *
 * We advertise ONLY the device-code grant, because that is the only one we
 * implement. Listing grants you do not support is how an agent picks a flow
 * that cannot work and blames its own client.
 */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return discoveryJson({
    issuer: origin,
    device_authorization_endpoint: `${origin}/api/agent/signup/start`,
    token_endpoint: `${origin}/api/agent/signup/poll`,
    grant_types_supported: ["urn:ietf:params:oauth:grant-type:device_code"],
    response_types_supported: [],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SCOPES,
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${origin}/auth.md`,
    ui_locales_supported: ["en"],
    // Non-standard but honest: name the human-approval requirement in the
    // metadata so a client knows a person is in the loop before it starts.
    "x-human-approval-required": true,
    "x-human-approval-endpoint": `${origin}/approve`,
  });
}
