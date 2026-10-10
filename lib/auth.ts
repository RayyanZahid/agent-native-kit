import { kvGet, kvSet } from "@/lib/store";
import { normalizeScopes, hasScope, type Scope } from "@/lib/scopes";

/**
 * Agent tokens. `agt_` prefix so a leaked one is greppable in logs and a human
 * can recognise it on sight.
 *
 * THE RULE THAT MATTERS MOST HERE: an agent cannot mint its own token. Every
 * token in this system was approved by a signed-in human through the device-code
 * flow in lib/device.ts. That is the entire security story, and it is why this
 * module has no "create token" endpoint an anonymous caller can reach.
 *
 * Scopes are FROZEN at mint time. There is deliberately no "add a scope to an
 * existing token" path: widening a token after a human approved it means the
 * human approved something other than what exists. Mint a new one instead.
 */
export type AgentToken = {
  id: string;
  token: string;
  scopes: Scope[];
  humanId: string;
  humanLabel: string;
  agentName: string;
  createdAt: string;
};

export function mintTokenValue(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "agt_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function saveToken(t: AgentToken): Promise<void> {
  await kvSet(`token:${t.token}`, t);
  await kvSet(`agent:${t.id}`, {
    id: t.id, agentName: t.agentName, humanLabel: t.humanLabel,
    scopes: t.scopes, createdAt: t.createdAt,
  });
}

export type GateOk = { ok: true; agent: AgentToken };
export type GateFail = { ok: false; code: "no_token" | "token_invalid"; message: string };

/**
 * Read and validate the bearer token. Returns a discriminated union rather than
 * throwing, so every caller is forced by the type system to handle the failure
 * path. A gate that throws gets wrapped in a try/catch that swallows it exactly
 * once, and then the route is open.
 */
export async function agentGate(req: Request): Promise<GateOk | GateFail> {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(agt_[a-f0-9]+)$/i.exec(h.trim());
  if (!m) {
    return { ok: false, code: "no_token", message: "No bearer token on the request." };
  }
  const t = await kvGet<AgentToken>(`token:${m[1]}`);
  if (!t) {
    return { ok: false, code: "token_invalid", message: "Token not recognised." };
  }
  // Re-normalise on read: a stored scope that no longer exists in the
  // vocabulary (renamed, removed) must not survive a deploy as a live grant.
  return { ok: true, agent: { ...t, scopes: normalizeScopes(t.scopes) } };
}

export { hasScope };
