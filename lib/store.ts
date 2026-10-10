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
  const raw = kvConfigured ? ((await rest(["GET", key])) as string | null) : (mem.get(key) ?? null);
  if (raw == null) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const raw = JSON.stringify(value);
  if (kvConfigured) {
    await rest(ttlSeconds ? ["SET", key, raw, "EX", String(ttlSeconds)] : ["SET", key, raw]);
  } else {
    mem.set(key, raw);
  }
}

export async function kvDel(key: string): Promise<void> {
  if (kvConfigured) await rest(["DEL", key]); else mem.delete(key);
}

/** Newest-first list. Capped so a workshop cannot fill a free KV tier. */
export async function kvPush(listKey: string, value: unknown, cap = 200): Promise<void> {
  const raw = JSON.stringify(value);
  if (kvConfigured) {
    await rest(["LPUSH", listKey, raw]);
    await rest(["LTRIM", listKey, "0", String(cap - 1)]);
  } else {
    const cur = JSON.parse(mem.get(listKey) ?? "[]") as string[];
    mem.set(listKey, JSON.stringify([raw, ...cur].slice(0, cap)));
  }
}

export async function kvList<T>(listKey: string, limit = 50): Promise<T[]> {
  let raws: string[];
  if (kvConfigured) {
    raws = ((await rest(["LRANGE", listKey, "0", String(limit - 1)])) as string[]) ?? [];
  } else {
    raws = (JSON.parse(mem.get(listKey) ?? "[]") as string[]).slice(0, limit);
  }
  const out: T[] = [];
  for (const r of raws) { try { out.push(JSON.parse(r) as T); } catch {} }
  return out;
}

/** Atomic-ish counter, used by the rate limiter. */
export async function kvIncr(key: string, ttlSeconds: number): Promise<number> {
  if (kvConfigured) {
    const n = (await rest(["INCR", key])) as number;
    if (n === 1) await rest(["EXPIRE", key, String(ttlSeconds)]);
    return n;
  }
  const n = Number(mem.get(key) ?? "0") + 1;
  mem.set(key, String(n));
  return n;
}
