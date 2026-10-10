import agentConfig from "@/agent.config";

/**
 * The capability VOCABULARY, not the gate.
 *
 * This module answers "which scopes may a user at tier X put on a token?"
 * It does NOT answer "may this token call this tool?" That is the runtime gate
 * in lib/auth.ts, and keeping the two separate is defense in depth: a
 * compromised mint path could forge a scope into a token, and the runtime gate
 * refuses calls under an unknown scope anyway.
 *
 * ADDING A SCOPE IS A THREE-STEP CHANGE. Fewer is how surfaces drift:
 *   1. Add it to `scopes` in agent.config.ts (the canonical wire format).
 *   2. Grant it to a tier in `tiers`.
 *   3. Declare it on the tool or route that requires it.
 * Every discovery document updates itself from step 1.
 */
export const SCOPES = Object.keys(agentConfig.scopes) as Scope[];
export type Scope = keyof typeof agentConfig.scopes;
export type Tier = keyof typeof agentConfig.tiers;

const SCOPE_SET = new Set<string>(SCOPES);

export function isKnownScope(s: string): s is Scope {
  return SCOPE_SET.has(s);
}

export function scopesForTier(tier: Tier): Scope[] {
  const grant = agentConfig.tiers[tier];
  return grant === "*" ? [...SCOPES] : [...(grant as readonly Scope[])];
}

/** Never returns a string outside SCOPES. Guard every mint path with this. */
export function normalizeScopes(input: readonly string[]): Scope[] {
  const out: Scope[] = [];
  for (const s of input) if (isKnownScope(s) && !out.includes(s)) out.push(s);
  return out;
}

export function scopesAllowedForTier(
  tier: Tier,
  requested: readonly string[],
): { ok: boolean; granted: Scope[]; ungranted: string[] } {
  const ceiling = new Set(scopesForTier(tier));
  const granted: Scope[] = [];
  const ungranted: string[] = [];
  for (const s of requested) {
    if (isKnownScope(s) && ceiling.has(s)) granted.push(s);
    else ungranted.push(s);
  }
  return { ok: ungranted.length === 0, granted, ungranted };
}

export function hasScope(held: readonly string[], required: Scope): boolean {
  return held.includes(required);
}

/**
 * Runs once at module load and THROWS on misconfiguration, so a bad grant table
 * fails the build rather than shipping. Cheap, and it catches real mistakes:
 * a tier granting a scope you renamed is otherwise completely silent.
 */
(function assertContainment() {
  for (const [tier, grant] of Object.entries(agentConfig.tiers)) {
    if (grant === "*") continue;
    for (const s of grant as readonly string[]) {
      if (!SCOPE_SET.has(s)) {
        throw new Error(`agent.config.ts: tier "${tier}" grants unknown scope "${s}"`);
      }
    }
  }
})();
