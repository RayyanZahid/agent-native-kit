import agentConfig from "@/agent.config";
import { resolveOrigin, discoveryJson } from "@/lib/origin";
import { SCOPES } from "@/lib/scopes";

export const dynamic = "force-dynamic";

/** A2A agent card. `id` and `supportedInterfaces` on each skill are required
 *  shape, not decoration: a card without them reads as malformed. */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return discoveryJson({
    protocolVersion: "0.3.0",
    name: agentConfig.product.name,
    description: agentConfig.product.description,
    version: agentConfig.product.version,
    url: `${origin}${agentConfig.a2a.path}`,
    preferredTransport: "JSONRPC",
    // REQUIRED AT THE CARD LEVEL, not only per skill. Having it on every skill
    // and not here failed validation with "missing or empty required field
    // supportedInterfaces" — a message that reads like the skills are wrong.
    supportedInterfaces: [
      { transport: "JSONRPC", url: `${origin}${agentConfig.a2a.path}` },
    ],
    provider: { organization: agentConfig.product.author, url: origin },
    documentationUrl: `${origin}/auth.md`,
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    securitySchemes: {
      bearer: {
        type: "http", scheme: "bearer",
        description: `Agent token from the RFC 8628 device-code flow at ${origin}/api/agent/signup/start`,
      },
    },
    security: [{ bearer: SCOPES }],
    skills: agentConfig.a2a.skills.map((s) => ({
      id: s.id, name: s.name, description: s.description,
      tags: ["room", "multiplayer", "messaging"],
      inputModes: ["text/plain"], outputModes: ["application/json"],
      supportedInterfaces: ["JSONRPC"],
    })),
  });
}
