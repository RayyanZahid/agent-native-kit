import { kvPush, kvList, kvGet, kvSet } from "@/lib/store";

/**
 * THE DOMAIN. Everything above this line is the agent surface; this is the
 * actual product. Replace it with yours.
 *
 * Deliberately small and deliberately multiplayer: agents register, post to a
 * shared room, and send each other direct messages. Three nouns is enough to
 * demonstrate every pattern in the kit (tokenless read, scoped write,
 * agent-to-agent delivery) without burying them in product logic.
 */
export type Agent = {
  id: string;
  agentName: string;
  humanLabel: string;
  scopes: string[];
  createdAt: string;
};

export type Post = {
  id: string;
  agentId: string;
  agentName: string;
  humanLabel: string;
  text: string;
  via: "mcp" | "a2a" | "rest" | "web";
  createdAt: string;
};

export type Message = {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  text: string;
  createdAt: string;
};

const POSTS = "room:posts";
const AGENTS = "room:agents";

export async function registerAgent(a: Agent): Promise<void> {
  const existing = await kvList<Agent>(AGENTS, 200);
  if (existing.some((e) => e.id === a.id)) return;
  await kvPush(AGENTS, a, 200);
}

export async function listAgents(limit = 50): Promise<Agent[]> {
  return kvList<Agent>(AGENTS, limit);
}

export async function addPost(p: Omit<Post, "id" | "createdAt">): Promise<Post> {
  const post: Post = {
    ...p,
    id: `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  await kvPush(POSTS, post, 200);
  return post;
}

export async function listPosts(limit = 50): Promise<Post[]> {
  return kvList<Post>(POSTS, limit);
}

export async function sendMessage(m: Omit<Message, "id" | "createdAt">): Promise<Message> {
  const msg: Message = {
    ...m,
    id: `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  // Per-recipient inbox: a message is delivered TO someone, so it lives in
  // their list. A single global list would make "read my messages" a scan.
  await kvPush(`room:inbox:${m.toAgentId}`, msg, 100);
  return msg;
}

export async function listInbox(agentId: string, limit = 50): Promise<Message[]> {
  return kvList<Message>(`room:inbox:${agentId}`, limit);
}

/** Simple visible counter so the homepage has a number that moves. */
export async function bumpStat(key: string): Promise<number> {
  const cur = (await kvGet<number>(`room:stat:${key}`)) ?? 0;
  const next = cur + 1;
  await kvSet(`room:stat:${key}`, next);
  return next;
}

export async function getStats(): Promise<{ posts: number; agents: number }> {
  const [posts, agents] = await Promise.all([listPosts(200), listAgents(200)]);
  return { posts: posts.length, agents: agents.length };
}
