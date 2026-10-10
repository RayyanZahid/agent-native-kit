import agentConfig from "@/agent.config";
import { resolveOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/**
 * MACHINE-READABLE PRICING. A FREE product still needs this document.
 *
 * That is counter-intuitive and it is the whole point: the check rewards
 * ANSWERING THE QUESTION, not having a price. An agent deciding whether to call
 * you needs to know it will not incur a charge, and "the page says nothing"
 * is not the same answer as "it is free."
 */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  const body = `# Pricing

Model: **${agentConfig.pricing.model}**

${agentConfig.pricing.summary}

## What an agent needs to know

| Question | Answer |
|---|---|
| Does any operation cost money? | No. |
| Is a payment method required to sign up? | No. |
| Is there a paid tier? | Not currently. |
| What limits apply instead? | Per-token, per-UTC-day rate limits. |
| How do I see my remaining budget? | \`RateLimit-Remaining\` on every response. |

## Limits

| Class | Calls per token per UTC day |
|---|---|
| public (no token) | 600 |
| read | 300 |
| write | 60 |
| message | 60 |

Exceeding a limit returns \`429\` with an RFC 9457 body whose \`remedy\` names
the reset window. Read \`RateLimit-Remaining\` and slow down before that.

## If this changes

Pricing changes are announced at ${origin}/developers before they take effect,
and this document is the machine-readable source of truth.

Machine-readable manifest: ${origin}/.well-known/ai-agent.json
`;
  return new Response(body, {
    headers: { "content-type": "text/markdown; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" },
  });
}
