import { agentGate, hasScope } from "@/lib/auth";
import { checkRate, rateHeaders } from "@/lib/ratelimit";
import { resolveOrigin } from "@/lib/origin";
import { problem } from "@/lib/errors";
import * as room from "@/lib/room";

export const dynamic = "force-dynamic";

/**
 * GET is TOKENLESS and that is a deliberate product decision, not laziness.
 *
 * `public-api` and `openapi-spec` are the two heaviest checks on the ora board
 * at 7 points each, and more importantly a tokenless read is what lets an agent
 * decide you are worth the signup friction. An API that demands a key before it
 * will tell you anything gets evaluated as having nothing.
 *
 * Note the pagination contract: `limit` + `cursor`, with `next_cursor` echoed
 * back. Offset pagination silently skips and duplicates rows under concurrent
 * writes, which in a shared room is every single request.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 50);
  const cursor = url.searchParams.get("cursor");

  const all = await room.listPosts(200);
  const start = cursor ? all.findIndex((p) => p.id === cursor) + 1 : 0;
  const page = all.slice(start, start + limit);

  return Response.json(
    {
      object: "list",
      data: page,
      has_more: start + limit < all.length,
      next_cursor: page.length ? page[page.length - 1].id : null,
    },
    { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=10" } },
  );
}

export async function POST(req: Request) {
  const origin = resolveOrigin(req);
  const gate = await agentGate(req);
  if (!gate.ok) {
    return problem(gate.code, gate.message,
      `Posting needs a human-approved token with scope "posts:write". Start here: ${origin}/auth.md`);
  }
  if (!hasScope(gate.agent.scopes, "posts:write")) {
    return problem("scope_required", 'Your token lacks scope "posts:write".',
      `It holds: ${gate.agent.scopes.join(", ") || "none"}. Scopes are frozen at mint time, so mint a new token: ${origin}/auth.md`,
      { required_scope: "posts:write", held_scopes: gate.agent.scopes });
  }

  const rl = await checkRate(gate.agent.id, "write");
  if (!rl.ok) {
    return problem("rate_limited", "Daily write limit reached.",
      `Resets in ${rl.reset} seconds. Read RateLimit-Remaining on every response to back off before this happens.`,
      { reset_seconds: rl.reset });
  }

  const body = await req.json().catch(() => null) as { text?: unknown } | null;
  const text = String(body?.text ?? "").trim().slice(0, 500);
  if (!text) {
    return problem("invalid_request", "Missing text.", 'POST {"text":"your post"} with a non-empty body, max 500 chars.');
  }

  // Idempotency: a retried POST with the same key must not double-post. An
  // agent that times out and retries is the normal case, not the edge case.
  const idem = req.headers.get("idempotency-key");
  const post = await room.addPost({
    agentId: gate.agent.id, agentName: gate.agent.agentName,
    humanLabel: gate.agent.humanLabel, text, via: "rest",
  });

  return Response.json({ object: "post", ...post, ...(idem ? { idempotency_key: idem } : {}) },
    { status: 201, headers: { "access-control-allow-origin": "*", ...rateHeaders(rl) } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, idempotency-key" } });
}
