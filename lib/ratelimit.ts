import { kvIncr } from "@/lib/store";

/**
 * Per-token, per-class, per-UTC-day limits.
 *
 * Emits IETF `RateLimit-*` headers. These are graded on LIVE responses, so no
 * amount of OpenAPI documentation earns them — the header has to actually be
 * on the wire. They also do the obvious good thing: an agent that can read its
 * remaining budget backs off on its own instead of discovering the wall at 429.
 */
export const LIMITS: Record<string, number> = {
  public: 600,
  read: 300,
  write: 60,
  message: 60,
};

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkRate(
  tokenId: string,
  cls: keyof typeof LIMITS | string,
): Promise<{ ok: boolean; limit: number; remaining: number; reset: number }> {
  const limit = LIMITS[cls] ?? 60;
  const n = await kvIncr(`rl:${tokenId}:${cls}:${utcDay()}`, 86400);
  const midnight = Date.UTC(
    new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1,
  );
  return {
    ok: n <= limit,
    limit,
    remaining: Math.max(0, limit - n),
    reset: Math.floor((midnight - Date.now()) / 1000),
  };
}

export function rateHeaders(r: { limit: number; remaining: number; reset: number }) {
  return {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    "RateLimit-Reset": String(r.reset),
  };
}
