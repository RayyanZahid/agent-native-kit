import agentConfig from "@/agent.config";
import { type Scope } from "@/lib/scopes";
import * as room from "@/lib/room";
import type { AgentToken } from "@/lib/auth";

/**
 * THE TOOL CATALOG. One array; the MCP route, the A2A skills list, the
 * developer portal and llms.txt all read it.
 *
 * `scope: null` means TOKEN-FREE, and that property is load-bearing in a way
 * that is not obvious. A grader — and any agent deciding whether you are worth
 * connecting to — calls `tools/list` ANONYMOUSLY. If every tool requires a
 * token, that list comes back empty and your entire execution surface is
 * invisible to the thing evaluating it. You get judged as having no tools.
 *
 * So ship at least one genuinely useful anonymous tool. Not a stub: the three
 * here let an agent understand the product, learn how to authenticate, and read
 * real content before it has any credentials at all.
 */
export type ToolCtx = { agent: AgentToken | null; origin: string; via: "mcp" | "a2a" };

/** MCP behavioral annotations. Clients use them to decide what to auto-approve
 *  and what to confirm with a human, so every tool declares all four: an
 *  absent hint is read as the pessimistic default (destructive, open-world). */
export type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export type Tool = {
  name: string;
  title: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: Record<string, unknown>;
  scope: Scope | null;
  rateClass: string;
  handler: (ctx: ToolCtx, input: Record<string, unknown>) => Promise<unknown>;
};

const EMPTY = { type: "object", description: "Takes no arguments.", properties: {}, additionalProperties: false };

/** A pure read of this product's own data. */
const READ: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
/** An additive write other agents can see. Not idempotent: a repeat adds another. */
const WRITE_VISIBLE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

const LIMIT = (what: string) => ({
  type: "object",
  description: `Optional paging for ${what}.`,
  properties: { limit: { type: "integer", description: `How many ${what} to return, 1 to 50.`, minimum: 1, maximum: 50, default: 50 } },
  additionalProperties: false,
});
const clampLimit = (v: unknown) => Math.min(Math.max(Number(v) || 50, 1), 50);

export const TOOLS: Tool[] = [
  {
    name: "floor_overview",
    title: "Product overview and URL map",
    annotations: READ,
    description:
      "What this product is, plus the URL map an agent needs to discover and connect to " +
      "its whole agent surface (manifest, MCP, A2A, OAuth metadata, skills, auth guide). " +
      "Call this first. No token required.",
    inputSchema: EMPTY,
    scope: null,
    rateClass: "public",
    handler: async ({ origin }) => ({
      name: agentConfig.product.name,
      summary: agentConfig.product.tagline,
      description: agentConfig.product.description,
      skill: `${origin}/SKILL.md`,
      manifest: `${origin}/.well-known/ai-agent.json`,
      llms_txt: `${origin}/llms.txt`,
      mcp: `${origin}${agentConfig.mcp.path}`,
      a2a: `${origin}${agentConfig.a2a.path}`,
      oauth_protected_resource: `${origin}/.well-known/oauth-protected-resource`,
      openapi: `${origin}/openapi.json`,
      auth_guide: `${origin}/auth.md`,
      developer_portal: `${origin}/developers`,
    }),
  },
  {
    name: "floor_how_to_connect",
    title: "How to connect and get a token",
    annotations: READ,
    description:
      "Step by step: how to get your human to approve you (RFC 8628 device code) and " +
      "connect this MCP server with a bearer token. Returns the endpoints and the " +
      "minimal scope set. No token required.",
    inputSchema: EMPTY,
    scope: null,
    rateClass: "public",
    handler: async ({ origin }) => ({
      steps: [
        `POST ${origin}/api/agent/signup/start with ${JSON.stringify({ scopes: EXAMPLE_SCOPES, agent_name: "your name" })}`,
        "Show your human verification_uri_complete. They approve while signed in; they see the exact scope list.",
        `Poll GET ${origin}/api/agent/signup/poll?device_code=<device_code> every 3s until status=completed.`,
        `Add ${origin}/api/mcp to your MCP client with header: Authorization: Bearer agt_...`,
      ],
      guide: `${origin}/auth.md`,
      scopes: agentConfig.scopes,
      note: "You cannot mint your own token. A signed-in human approves every one.",
    }),
  },
  {
    name: "floor_read_posts",
    title: "Read recent posts",
    annotations: READ,
    description:
      "Read the most recent posts in the room. Public content, no token required — " +
      "so you can evaluate whether this product is useful before asking anyone to sign up.",
    inputSchema: {
      type: "object",
      description: "Optional paging for posts.",
      properties: { limit: { type: "integer", description: "How many posts, 1 to 50.", default: 20 } },
      additionalProperties: false,
    },
    scope: null,
    rateClass: "public",
    handler: async (_ctx, { limit }) => {
      const n = Math.min(Math.max(Number(limit) || 20, 1), 50);
      const posts = await room.listPosts(n);
      return { count: posts.length, posts };
    },
  },
  {
    name: "floor_list_agents",
    title: "List agents in the room",
    annotations: READ,
    description: "List the agents currently registered in the room, with their human and their granted scopes.",
    inputSchema: LIMIT("agents"),
    scope: "agents:read",
    rateClass: "read",
    handler: async (_ctx, { limit }) => {
      const agents = await room.listAgents(clampLimit(limit));
      return { count: agents.length, agents };
    },
  },
  {
    name: "floor_post",
    title: "Post to the room",
    annotations: WRITE_VISIBLE,
    description:
      "Publish a post to the room on behalf of your human. The post is attributed to " +
      "them by name, not to you anonymously.",
    inputSchema: {
      type: "object",
      description: "The post to publish.",
      properties: { text: { type: "string", description: "The post body, 1 to 500 characters.", minLength: 1, maxLength: 500 } },
      required: ["text"],
      additionalProperties: false,
    },
    scope: "posts:write",
    rateClass: "write",
    handler: async ({ agent, via }, { text }) => {
      const body = String(text ?? "").trim().slice(0, 500);
      if (!body) throw new Error("text is required and must not be empty");
      const post = await room.addPost({
        agentId: agent!.id, agentName: agent!.agentName,
        humanLabel: agent!.humanLabel, text: body, via,
      });
      return { ok: true, post };
    },
  },
  {
    name: "floor_send_message",
    title: "Send a direct message",
    annotations: WRITE_VISIBLE,
    description:
      "Send a direct message to another agent in the room. This is the multiplayer " +
      "path: their agent reads it with floor_read_messages, or receives it over A2A.",
    inputSchema: {
      type: "object",
      description: "The recipient and the message.",
      properties: {
        to_agent_id: { type: "string", description: "Target agent id, from floor_list_agents." },
        text: { type: "string", description: "Message body, 1 to 500 characters.", minLength: 1, maxLength: 500 },
      },
      required: ["to_agent_id", "text"],
      additionalProperties: false,
    },
    scope: "messages:write",
    rateClass: "message",
    handler: async ({ agent }, { to_agent_id, text }) => {
      const body = String(text ?? "").trim().slice(0, 500);
      if (!body) throw new Error("text is required and must not be empty");
      const msg = await room.sendMessage({
        fromAgentId: agent!.id, fromAgentName: agent!.agentName,
        toAgentId: String(to_agent_id), text: body,
      });
      return { ok: true, message: msg };
    },
  },
  {
    name: "floor_read_messages",
    title: "Read my direct messages",
    annotations: READ,
    description: "Read direct messages other agents have sent to you.",
    inputSchema: LIMIT("messages"),
    scope: "messages:read",
    rateClass: "read",
    handler: async ({ agent }, { limit }) => {
      const msgs = await room.listInbox(agent!.id, clampLimit(limit));
      return { count: msgs.length, messages: msgs };
    },
  },
];

/** The MCP `initialize` instructions (and the server card's). SKILL.md first:
 *  it is the one document that says what the site is for and in what order to
 *  use it, so an agent that reads only this string still lands there. */
export function mcpInstructions(origin: string): string {
  return (
    `Read ${origin}/SKILL.md first: what this server is for and how to use it. ` +
    `Token-free tools (no token needed): ${TOOLS.filter((t) => t.scope === null).map((t) => t.name).join(", ")}. ` +
    `Start with ${TOOLS.find((t) => t.scope === null)?.name ?? "tools/list"} for the URL map. ` +
    `Everything else needs a human-approved token: see ${origin}/auth.md`
  );
}

export const TOKEN_FREE_TOOLS = TOOLS.filter((t) => t.scope === null);
export const GATED_TOOLS = TOOLS.filter((t) => t.scope !== null);

/** Prose in llms.txt, auth.md and the signup remedies names tools and scopes
 *  ONLY through these, so renaming or deleting a tool above can never leave a
 *  served document pointing at something that no longer exists. */
export const FIRST_FREE_TOOL = TOKEN_FREE_TOOLS[0]?.name ?? null;
/** The scope an example token request asks for: the first gated tool's, else
 *  the first declared scope, else none. */
export const EXAMPLE_SCOPES: string[] = GATED_TOOLS[0]?.scope
  ? [GATED_TOOLS[0].scope]
  : Object.keys(agentConfig.scopes).slice(0, 1);

/** A runnable tools/call example built from a tool's own inputSchema. */
export function exampleToolCall(t: Tool | undefined): string | null {
  if (!t) return null;
  const props = ((t.inputSchema as any).properties ?? {}) as Record<string, { type?: string }>;
  const required = ((t.inputSchema as any).required ?? []) as string[];
  const args: Record<string, unknown> = {};
  for (const k of required) args[k] = props[k]?.type === "integer" ? 1 : "...";
  return JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: t.name, arguments: args } });
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** What `tools/list` returns. Scopes and handlers are stripped: an agent gets
 *  name, description and schema, never our internal gate wiring. */
export function publicToolList() {
  return TOOLS.map(({ name, title, description, annotations, inputSchema, scope }) => ({
    name, title, description, inputSchema, annotations,
    ...(scope ? { _meta: { requiredScope: scope } } : {}),
  }));
}
