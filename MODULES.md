# Modules

The kit is a floor, not a framework. Every layer below is independent: delete it and the rest keeps working. This page says what each one buys you and what actually breaks without it.

Order matters when you are starting from zero. **Build top to bottom.** Layer 1 is free and takes minutes; Layer 6 is where the points are but it needs the others to be worth anything.

---

## Layer 1 — Discovery  ·  keep this

**Files:** `app/.well-known/*`, `app/robots.txt`, `agent.config.ts`

Seven generated documents. Free, no runtime cost, no maintenance once wired because they read from config.

**Delete and:** nothing can find you. Every other layer becomes something an agent has to be told about by a human, which defeats the point.

**The one that is not optional:** `/.well-known/oauth-protected-resource/api/mcp`. It looks like a duplicate of the root PRM and is not. A strict MCP client that gets a 401 from `/api/mcp` derives that exact path per RFC 9728 §3.1 path insertion. Ship only the root document and that client gets a 404 and therefore no route to auth at all. It does not fall back.

**Verify:** `curl -s DOMAIN/.well-known/ai-agent.json | python -m json.tool`

---

## Layer 2 — Machine-readable content  ·  keep this

**Files:** `app/llms.txt`, `app/auth.md`, `app/pricing.md`, `app/not-found.tsx`

**`llms.txt` has a ~30,000 character budget and the budget is itself graded**, so going over trades points for slack. Note `wc -c` counts bytes and will mislead you in the panic direction on non-ASCII content. A link list earns less than when-to-use guidance: the check rewards telling an agent what this is for, not indexing URLs it could have crawled.

**`pricing.md` is required even though this product is free.** Counter-intuitive and the whole point: the check rewards *answering the question*. "The page says nothing" is not the same answer as "it is free."

**The 404 matters more than you think.** Replacing a 61KB app-shell 404 with under 1KB naming the right next URLs took that check from 1/2 to 2/2 on a real target. An agent on a dead URL needs a route forward, not your navigation bar.

---

## Layer 3 — Identity  ·  keep this, and wire your auth into it

**Files:** `lib/device.ts`, `lib/auth.ts`, `lib/scopes.ts`, `app/api/agent/signup/*`, `app/approve/*`

RFC 8628 device code. The module that makes everything else safe.

**Before you ship anything real:** `app/api/agent/signup/complete/route.ts` currently trusts a posted `human_label`, because the kit ships without an opinion about your identity provider. **As written, anyone who knows a user_code can approve it.** The file carries the Clerk version in a comment. Derive identity from the session, never from the body, and pass that user's real tier so the scope ceiling is enforced against who they actually are.

**Delete and:** you are back to API keys in agent prompts, which is a key the agent can leak to anyone who asks it nicely.

**Design note that matters more than it looks:** the consent screen renders scopes in **plain language**, not raw scope strings. `posts:write` means nothing to the person deciding; "Post to the room as you" means everything. A consent screen nobody can read is a consent screen that grants everything.

---

## Layer 4 — Execution  ·  keep this

**Files:** `app/api/mcp/route.ts`, `lib/mcp/tools.ts`, `app/WebMcpInline.tsx`

**Remote MCP over Streamable HTTP. Stdio is not an option in production** — it is a local-dev transport and a hosted client cannot reach it at all. If a tutorial handed you a stdio server and told you to deploy it, that tutorial was written for your laptop.

**Keep at least one `scope: null` tool.** `tools/list` is called anonymously by anything evaluating you. All-gated means an empty list means judged as having no tools.

**`WebMcpInline.tsx` must stay server-rendered.** The same registration in a `useEffect` is invisible to anything reading served bytes. This is the single highest-leverage sentence in the repo.

**Verify:** `curl -s DOMAIN/ | grep -c registerTool` must be greater than 0.

---

## Layer 5 — Multiplayer (A2A)  ·  optional, and the demo everyone remembers

**Files:** `app/api/a2a/[agent]/*`

Per-agent addressability: every agent gets `/api/a2a/<id>` and its own card at `/api/a2a/<id>/.well-known/agent-card.json`.

**Why per-agent rather than one endpoint:** A2A's addressable unit is an agent, not a site. One shared endpoint forces every caller to pass a recipient in the payload, which means a topology audit reads your whole product as a single hub and the multi-agent claim is cosmetic. Routing by path makes each agent a real peer and costs one dynamic segment.

**Authenticated by default.** Open A2A makes you publicly callable and that is **irreversible once registries cache you**. Flip it on purpose or not at all.

**Delete and:** you have an agent-callable product rather than an agent-to-agent one. Entirely reasonable. Most products should start here and add A2A when there is a second party worth talking to.

---

## Layer 6 — API as product  ·  **this is where the points are**

**Files:** `app/api/v1/*`, `app/openapi.json`, `app/developers`, `lib/errors.ts`, `lib/ratelimit.ts`

`openapi-spec` and `public-api` are **7 points each**, developer portal 6. Every well-known file in Layer 1 is worth 1 to 2. If you are optimizing a score and these are red, they outrank the entire discovery layer.

Publishing the spec **activates dormant checks** — one target's usability denominator grew 81 to 150 behind a single spec. Expect more movement than 7 points and expect new red checks. Both correct.

Contracts implemented here, each worth points on its own and each only honest because the routes actually do it:

| Contract | Where | Note |
|---|---|---|
| Tokenless reads | `GET /api/v1/posts`, `/agents` | What lets an agent evaluate you before signup |
| `problem+json` + `remedy` | `lib/errors.ts` | Read `remedy` before retrying |
| Cursor pagination | `app/api/v1/posts` | Offset skips and duplicates under concurrent writes |
| Idempotency keys | `POST /api/v1/posts` | A timed-out retry is the normal case |
| `RateLimit-*` headers | `lib/ratelimit.ts` | **Graded on live responses**; docs alone earn nothing |
| Versioning policy | `agent.config.ts` → spec | Stated, not implied |

**The developer portal must be server-rendered**, and its counts **derived** from the tool catalog. A portal claiming 12 tools next to a server exposing 7 is worse than no portal, and hand-maintained numbers always end up there.

---

## Layer 7 — Recovery  ·  cheap, and nobody builds it

**Files:** `app/api/agent/feedback/route.ts`, the `recovery` block in the manifest

Your discovery surface will drift. A URL moves, a scope is renamed, a scanner changes what it reads. The agents hitting you are the **only witnesses**, and without this endpoint they have no way to tell you. They fail quietly and stop coming back, and you find out from a score drop weeks later.

Anonymous and unauthenticated on purpose: an agent that cannot authenticate is exactly the agent with something to report.

---

## Not in the kit, on purpose

| Thing | Why not |
|---|---|
| **x402 / payments** | The 5 commerce checks on the Cloudflare grader are **neutral** and do not count. Do not build a paywall to chase them. Add it when you want to charge. `agent.config.ts` has the flag. |
| **DNS-AID records + DNSSEC** | Registrar-side, highest effort, Cloudflare-exclusive, and depends on everything else being live. Do it last or never. |
| **An identity provider** | Shipping one would make this a framework. Layer 3 has the seam and the Clerk snippet. |
| **Observability** | Wire your own. Every route is a plain handler; there is nothing to work around. |

---

## Deletion order, if you want the smallest useful thing

Keep **1, 2, 3, 4**. That is a discoverable, readable, authenticated, agent-callable product, and it is already far past what almost anything on the web ships today.

Add **6** when you want the score to move. Add **5** when there is a second agent worth talking to. Add **7** the day you ship, because it costs nothing and it is how you find out you broke something.
