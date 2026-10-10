import { kvGet, kvSet, kvDel } from "@/lib/store";
import { mintTokenValue, saveToken } from "@/lib/auth";
import { scopesAllowedForTier, normalizeScopes, type Scope, type Tier } from "@/lib/scopes";

/**
 * RFC 8628 Device Authorization Grant — the human-approval bridge.
 *
 * This is the single most important module in the kit and the one people skip.
 *
 * The problem it solves: an agent needs credentials, but an agent must not be
 * able to give itself credentials. Every other answer to that is worse. An API
 * key in the agent's prompt is a key the agent can leak to anyone who asks it
 * nicely. A browser OAuth redirect assumes the agent has a browser and a human
 * watching it. Device code assumes neither: the agent gets a short code, a
 * human opens a URL on whatever device they already trust, sees the EXACT scope
 * list in plain language, and approves or does not.
 *
 * So the audit trail reads: "a signed-in human approved these five scopes for
 * an agent calling itself X at this timestamp." That is a sentence you can show
 * a security reviewer. "The agent had a key" is not.
 *
 * Flow:
 *   POST /api/agent/signup/start     -> device_code + user_code + verify URL
 *   human opens verify URL, approves -> POST /api/agent/signup/complete
 *   POST /api/agent/signup/poll      -> the token, once
 */
const TTL = 900; // 15 minutes. Long enough for a human to find their phone.

export type DeviceFlow = {
  deviceCode: string;
  userCode: string;
  scopes: Scope[];
  agentName: string;
  status: "pending" | "approved" | "denied";
  token?: string;
  humanId?: string;
  humanLabel?: string;
  createdAt: string;
};

/** Human-readable, unambiguous. No 0/O or 1/I: these get read aloud across a room. */
function userCode(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const s = Array.from(bytes, (b) => A[b % A.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function startDeviceFlow(
  requested: readonly string[],
  agentName: string,
  origin: string,
) {
  // Cap to what the HIGHEST self-service tier could ever grant. The human
  // approval step re-validates against that human's ACTUAL tier, so an
  // anonymous request cannot talk its way past this ceiling.
  const ceiling = scopesAllowedForTier("member" as Tier, normalizeScopes(requested));
  if (!ceiling.ok) {
    return {
      ok: false as const,
      error: "scope_above_ceiling" as const,
      ungranted: ceiling.ungranted,
    };
  }

  const deviceCode = mintTokenValue().replace("agt_", "dev_");
  const uc = userCode();
  const flow: DeviceFlow = {
    deviceCode, userCode: uc, scopes: ceiling.granted,
    agentName: agentName || "unnamed agent",
    status: "pending", createdAt: new Date().toISOString(),
  };
  await kvSet(`dev:${deviceCode}`, flow, TTL);
  await kvSet(`uc:${uc}`, deviceCode, TTL);

  return {
    ok: true as const,
    device_code: deviceCode,
    user_code: uc,
    verification_uri: `${origin}/approve`,
    verification_uri_complete: `${origin}/approve?code=${uc}`,
    expires_in: TTL,
    interval: 3,
    scopes: ceiling.granted,
  };
}

export async function approveDeviceFlow(
  code: string,
  humanId: string,
  humanLabel: string,
  tier: Tier = "member",
) {
  const deviceCode = await kvGet<string>(`uc:${code.toUpperCase()}`);
  if (!deviceCode) return { ok: false as const, error: "unknown_or_expired_code" };
  const flow = await kvGet<DeviceFlow>(`dev:${deviceCode}`);
  if (!flow) return { ok: false as const, error: "unknown_or_expired_code" };
  if (flow.status !== "pending") return { ok: false as const, error: "already_resolved" };

  // Re-validate at the approving human's REAL tier. The /start ceiling was a
  // guess made by an anonymous caller; this is the authoritative check.
  const real = scopesAllowedForTier(tier, flow.scopes);

  const token = mintTokenValue();
  const id = `ag_${token.slice(4, 16)}`;
  await saveToken({
    id, token, scopes: real.granted, humanId, humanLabel,
    agentName: flow.agentName, createdAt: new Date().toISOString(),
  });
  await kvSet(`dev:${deviceCode}`, {
    ...flow, status: "approved", token, humanId, humanLabel,
  } satisfies DeviceFlow, TTL);

  return { ok: true as const, granted: real.granted, agentName: flow.agentName };
}

export async function pollDeviceFlow(deviceCode: string) {
  const flow = await kvGet<DeviceFlow>(`dev:${deviceCode}`);
  if (!flow) return { status: "expired" as const };
  if (flow.status === "pending") return { status: "pending" as const };
  if (flow.status === "denied") return { status: "denied" as const };

  // Hand the token over exactly ONCE, then destroy the flow record. A device
  // code that keeps returning a live token is a credential sitting in a cache
  // with a 15-minute window and no owner.
  await kvDel(`dev:${deviceCode}`);
  await kvDel(`uc:${flow.userCode}`);
  return {
    status: "completed" as const,
    access_token: flow.token,
    token_type: "Bearer",
    scopes: flow.scopes,
    human: flow.humanLabel,
  };
}
