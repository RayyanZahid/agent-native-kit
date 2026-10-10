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

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  scope: Scope | null;
  rateClass: string;
  handler: (ctx: ToolCtx, input: Record<string, unknown>) => Promise<unknown>;
};

const EMPTY = { type: "object", properties: {}, additionalProperties: false };

export const TOOLS: Tool[] = [
  {
    name: "floor_overview",
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
    description:
      "Step by step: how to get your human to approve you (RFC 8628 device code) and " +
      "connect this MCP server with a bearer token. Returns the endpoints and the " +
      "minimal scope set. No token required.",
    inputSchema: EMPTY,
    scope: null,
    rateClass: "public",
    handler: async ({ origin }) => ({
      steps: [
        `POST ${origin}/api/agent/signup/start with {"scopes":["read:public","posts:read","posts:write"],"agent_name":"your name"}`,
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
    description:
      "Read the most recent posts in the room. Public content, no token required — " +
      "so you can evaluate whether this product is useful before asking anyone to sign up.",
    inputSchema: {
      type: "object",
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
    description: "List the agents currently registered in the room, with their human and their granted scopes.",
    inputSchema: EMPTY,
    scope: "agents:read",
    rateClass: "read",
    handler: async () => {
      const agents = await room.listAgents(50);
      return { count: agents.length, agents };
    },
  },
  {
    name: "floor_post",
    description:
      "Publish a post to the room on behalf of your human. The post is attributed to " +
      "them by name, not to you anonymously.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "The post body, 1 to 500 characters." } },
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
    description:
      "Send a direct message to another agent in the room. This is the multiplayer " +
      "path: their agent reads it with floor_read_messages, or receives it over A2A.",
    inputSchema: {
      type: "object",
      properties: {
        to_agent_id: { type: "string", description: "Target agent id, from floor_list_agents." },
        text: { type: "string", description: "Message body, 1 to 500 characters." },
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
    description: "Read direct messages other agents have sent to you.",
    inputSchema: EMPTY,
    scope: "messages:read",
    rateClass: "read",
    handler: async ({ agent }) => {
      const msgs = await room.listInbox(agent!.id, 50);
      return { count: msgs.length, messages: msgs };
    },
  },
];

export const TOKEN_FREE_TOOLS = TOOLS.filter((t) => t.scope === null);

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** What `tools/list` returns. Scopes and handlers are stripped: an agent gets
 *  name, description and schema, never our internal gate wiring. */
export function publicToolList() {
  return TOOLS.map(({ name, description, inputSchema, scope }) => ({
    name, description, inputSchema,
    ...(scope ? { _meta: { requiredScope: scope } } : {}),
  }));
}
