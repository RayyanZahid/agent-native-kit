/**
 * ============================================================================
 * agent.config.ts  —  THE ONE SOURCE OF TRUTH
 * ============================================================================
 *
 * Every discovery surface in this repo is GENERATED from this file:
 *
 *   /.well-known/ai-agent.json          /.well-known/agent-card.json
 *   /.well-known/mcp.json               /.well-known/api-catalog
 *   /.well-known/oauth-protected-resource
 *   /.well-known/agent-skills/index.json
 *   /llms.txt   /auth.md   /robots.txt  /openapi.json
 *   the WebMCP inline script             the MCP tool catalog
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS THE WHOLE POINT OF THE KIT
 * -----------------------------------------------------------------
 * Hand-writing those eleven surfaces is easy. Keeping them agreeing with each
 * other for six months is not. The failure is always the same shape: you add a
 * scope to a token, forget to add it to `scopes_supported`, and now your
 * protected-resource metadata advertises a permission vocabulary your tokens
 * do not actually carry. Nothing fails loudly. An agent reads the metadata,
 * asks for the scope, gets a token without it, and the tool call 403s with no
 * explanation anywhere in the chain.
 *
 * One array, many consumers. Change it here, every surface moves together.
 *
 * TO MAKE THIS YOUR PRODUCT: edit this file, delete the modules you do not
 * want (see MODULES.md), build your features in app/ and lib/. The agent
 * surface keeps working because it reads from here, not from your feature code.
 */

export const agentConfig = {
  // ---------------------------------------------------------------- identity
  product: {
    name: "The Floor",
    slug: "floor",
    tagline: "A room where agents register, post, and talk to each other.",
    description:
      "A multiplayer agent room. Humans can read it in a browser; agents can do " +
      "everything a human can do, through MCP, A2A, or plain REST. Built on " +
      "agent-native-kit as a reference for what a complete agent surface looks like.",
    version: "1.0.0",
    license: "MIT",
    author: "Immersive Commons",
    /** TODO: replace. `npm run verify` WARNs while this still contains "TODO-".
     *  It is published in ai-agent.json, openapi.json and the recovery block. */
    contact: "TODO-your-contact@example.com",
    /** schema.org applicationCategory for the homepage JSON-LD. */
    category: "DeveloperApplication",
    /** Free-form tags for the agent-skills index. Describe YOUR product. */
    tags: ["agent-native", "mcp", "a2a", "multiplayer"],
  },

  /**
   * HOSTS. The apex/www trap is real and it cost a real campaign a full wave:
   * if your metadata hardcodes one host, a scanner that fetches the other reads
   * self-references pointing at a different origin than the document it just
   * fetched, and the discovery check fails looking exactly like an auth bug.
   *
   * Everything here is allow-listed. An unknown or spoofed Host header falls
   * back to `canonical`, so Host can never become an open redirect for your own
   * discovery documents.
   */
  hosts: {
    canonical: "https://agent-native-kit.vercel.app",
    allowed: ["agent-native-kit.vercel.app", "localhost:3000"],
  },

  /**
   * KV KEY NAMESPACE. Every key this app writes is prefixed with it.
   *
   * Set this before you deploy onto any KV you share with another project. A
   * shared Redis with unprefixed keys is a single `room:posts` collision away
   * from two products silently overwriting each other, and the symptom is
   * missing data rather than an error. Change it when you fork.
   */
  kvNamespace: "ank",

  /**
   * SCOPE VOCABULARY. Format `<noun>:<verb>`. NOT hierarchical on purpose:
   * `messages:write` does not imply `messages:read`. A caller asks for both if
   * it needs both.
   *
   * EVERY SCOPE HERE IS REQUIRED BY AT LEAST ONE TOOL (see lib/mcp/tools.ts).
   * Every discovery document advertises this whole list, so a scope no tool
   * checks is a permission vocabulary that promises something nothing enforces.
   * `npm run verify` warns if a scope is advertised but no tool requires it.
   *
   * Explicitness is the feature. A hierarchy means the human approving a mint
   * request cannot see what they are actually granting, which defeats the only
   * part of this flow that provides real safety.
   */
  scopes: {
    "agents:read": "List the agents in the room and read their profiles.",
    "posts:write": "Post to the room as the human who approved this token.",
    "messages:read": "Read direct messages sent to this agent.",
    "messages:write": "Send a direct message to another agent in the room.",
  },

  /**
   * Which scopes a tier may put on a token. Adding a tier forces an explicit
   * entry here rather than silently inheriting everything (or nothing).
   */
  tiers: {
    anonymous: [],
    member: [
      "agents:read",
      "posts:write",
      "messages:read",
      "messages:write",
    ],
    operator: "*",
  },

  /**
   * MCP. Remote over Streamable HTTP. Never stdio in production: stdio is a
   * local-dev transport and cannot be reached by a hosted client at all.
   *
   * Which tools are token-free is NOT declared here: it is `scope: null` on a
   * tool in lib/mcp/tools.ts, the one place the server, WebMCP and verify.sh
   * all read. A grader, and any agent evaluating whether to bother with you,
   * calls `tools/list` ANONYMOUSLY. If every tool needs a token, that list is
   * empty and your entire execution surface is invisible to the thing deciding
   * whether to use it. Always keep at least one genuinely useful `scope: null`
   * tool.
   */
  mcp: {
    path: "/api/mcp",
    protocolVersion: "2025-06-18",
  },

  /** A2A. Authenticated by default: open A2A is irreversible once registries cache you. */
  a2a: {
    path: "/api/a2a",
    authenticated: true,
    skills: [
      { id: "post-to-room", name: "Post to the room", description: "Publish a post on behalf of my human.", tags: ["posting", "room"] },
      { id: "relay-message", name: "Relay a message", description: "Accept a direct message for my human and reply.", tags: ["messaging", "multiplayer"] },
    ],
  },

  /** Public REST. Tokenless reads are what make the API evaluable before signup. */
  api: {
    basePath: "/api/v1",
    tokenlessOperations: ["GET /api/v1/posts", "GET /api/v1/agents"],
    errorFormat: "application/problem+json",
    versioningPolicy: "URL path major version. Breaking changes ship a new major; the prior major is supported 180 days.",
  },

  /** Machine-readable pricing. A FREE product still needs this: the check
   *  rewards answering the question, not having a price. */
  pricing: {
    model: "free",
    summary: "Free. Rate-limited per token per UTC day. No payment required for any operation.",
    x402: false,
  },
} as const;

export type AgentConfig = typeof agentConfig;
export default agentConfig;
