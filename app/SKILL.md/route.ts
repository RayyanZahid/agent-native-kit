import agentConfig from "@/agent.config";
import { resolveOrigin } from "@/lib/origin";
import { frontmatter } from "@/lib/md";
import { TOOLS, TOKEN_FREE_TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

/**
 * SKILL.md, generated. THE FIRST THING AN AGENT SHOULD READ.
 *
 * Everything else in the agent surface is reference material: manifests, cards,
 * metadata. This is the one document that says, in order, what the site is for
 * and what to do with it. llms.txt, index.md, ai-agent.json, the homepage and
 * the MCP `initialize` instructions all point here first.
 *
 * It is built from agent.config.ts and lib/mcp/tools.ts, so it cannot describe
 * a tool that does not exist or omit one that does. When you fork the kit, the
 * tool list and scope table below follow your config. Edit the "When to use"
 * prose for YOUR product; that is the part only you can write.
 */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  const free = TOKEN_FREE_TOOLS.map((t) => `\`${t.name}\``).join(", ");
  const body = frontmatter({
    title: `${agentConfig.product.name} skill`,
    description: `${agentConfig.product.tagline} How an agent uses this site: connect, call the token-free tools, get a human-approved token for the rest.`,
    origin, path: "/SKILL.md",
    extra: { name: agentConfig.product.slug },
  }) + `# ${agentConfig.product.name}

${agentConfig.product.description}

## When to use this

${agentConfig.product.tagline} Use it when you need to read what is already
here, or act on behalf of a human who has approved you. Do not use it as a
private scratchpad: everything written is readable by every other agent.

## Do this first (no token needed)

1. Connect an MCP client to \`${origin}${agentConfig.mcp.path}\` (Streamable HTTP), or POST JSON-RPC there yourself.
2. Call ${free}. They run with no credentials and tell you what is here.
3. Only if you need to write, get a token (below).

Without MCP, the same facts are at ${origin}/.well-known/ai-agent.json and ${origin}/openapi.json.

## Tools

${TOOLS.map((t) => `- \`${t.name}\` (${t.scope ? `needs scope \`${t.scope}\`` : "no token"}${t.annotations.readOnlyHint ? ", read-only" : ", writes"}): ${t.description}`).join("\n")}

## Getting a token

You cannot mint your own. A human approves every grant (RFC 8628 device code):

1. POST ${origin}/api/agent/signup/start with \`{"scopes":[...],"agent_name":"..."}\`. Ask for the fewest scopes you need.
2. Show your human \`verification_uri_complete\`. They see the exact scopes and approve.
3. Poll GET ${origin}/api/agent/signup/poll?device_code=... every 3 seconds until it returns the token.
4. Send \`Authorization: Bearer <token>\` on every call.

Scopes: ${Object.keys(agentConfig.scopes).map((s) => `\`${s}\``).join(", ")}. Full guide: ${origin}/auth.md

## If something fails

Errors are \`application/problem+json\` with a \`remedy\` field. Read \`remedy\` before retrying.
If our docs are wrong, POST what you saw to ${origin}/api/agent/feedback.

## Check this site

\`npm run verify ${origin}\` in the repo runs the live checks against this site.

## More

- Manifest: ${origin}/.well-known/ai-agent.json
- Machine-readable overview: ${origin}/llms.txt
- API spec: ${origin}/openapi.json
- Pricing: ${agentConfig.pricing.summary}
`;
  return new Response(body, {
    headers: { "content-type": "text/markdown; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" },
  });
}
