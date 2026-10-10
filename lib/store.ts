/**
 * Pluggable KV. Two backends, one interface.
 *
 *   KV_REST_API_URL + KV_REST_API_TOKEN set  ->  Upstash-protocol REST KV
 *   neither set                              ->  in-process Map
 *
 * READ THIS BEFORE YOU DEPLOY. The in-process Map is for `next dev` only. On
 * any serverless host each invocation may land in a fresh instance, so writes
 * appear to succeed and then vanish — which is far more confusing than an
 * outright failure, because nothing errors. If you deploy without KV env vars,
 * the homepage says so out loud rather than letting you discover it live.
 *
 * The Upstash REST protocol is what Vercel KV, Upstash, and a self-hosted
 * serverless-redis-http all speak, so this one client covers every option
 * including your own Redis on your own box.
 */
import agentConfig from "@/agent.config";

/**
 * Every key is namespaced. On shared KV this is not optional: two products
 * writing an unprefixed `room:posts` silently overwrite each other, and the
 * symptom is missing data rather than an error.
 */
const NS = agentConfig.kvNamespace;
const k = (key: string) => `${NS}:${key}`;

const URL_ = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

export const kvConfigured = Boolean(URL_ && TOKEN);

const mem = new Map<string, string>();

async function rest(cmd: unknown[]): Promise<unknown> {
  const r = await fetch(URL_!, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`kv ${r.status}`);
  const j = (await r.json()) as { result?: unknown };
  return j.result;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const raw = kvConfigured ? ((await rest(["GET", k(key)])) as string | null) : (mem.get(k(key)) ?? null);
  if (raw == null) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const raw = JSON.stringify(value);
  if (kvConfigured) {
    await rest(ttlSeconds ? ["SET", k(key), raw, "EX", String(ttlSeconds)] : ["SET", k(key), raw]);
  } else {
    mem.set(k(key), raw);
  }
}

export async function kvDel(key: string): Promise<void> {
  if (kvConfigured) await rest(["DEL", k(key)]); else mem.delete(k(key));
}

/** Newest-first list. Capped so a workshop cannot fill a free KV tier. */
export async function kvPush(listKey: string, value: unknown, cap = 200): Promise<void> {
  const raw = JSON.stringify(value);
  if (kvConfigured) {
    await rest(["LPUSH", k(listKey), raw]);
    await rest(["LTRIM", k(listKey), "0", String(cap - 1)]);
  } else {
    const cur = JSON.parse(mem.get(k(listKey)) ?? "[]") as string[];
    mem.set(k(listKey), JSON.stringify([raw, ...cur].slice(0, cap)));
  }
}

export async function kvList<T>(listKey: string, limit = 50): Promise<T[]> {
  let raws: string[];
  if (kvConfigured) {
    raws = ((await rest(["LRANGE", k(listKey), "0", String(limit - 1)])) as string[]) ?? [];
  } else {
    raws = (JSON.parse(mem.get(k(listKey)) ?? "[]") as string[]).slice(0, limit);
  }
  const out: T[] = [];
  for (const r of raws) { try { out.push(JSON.parse(r) as T); } catch {} }
  return out;
}

/** Atomic-ish counter, used by the rate limiter. */
export async function kvIncr(key: string, ttlSeconds: number): Promise<number> {
  if (kvConfigured) {
    const n = (await rest(["INCR", k(key)])) as number;
    if (n === 1) await rest(["EXPIRE", k(key), String(ttlSeconds)]);
    return n;
  }
  const n = Number(mem.get(k(key)) ?? "0") + 1;
  mem.set(k(key), String(n));
  return n;
}
