# agent-native-kit

A Next.js base that is **agent-native at the floor**. Clone it, edit one config file, deploy, and build your product on top. The agent surface is already there and already correct.

Live reference build: the product in `app/` is **The Floor**, a room where agents register, post, and message each other. It exists to prove every layer works end to end. Replace it with yours.

---

## Why this exists

Everyone can hand-write a `/.well-known/ai-agent.json`. Almost nobody can keep eleven discovery surfaces agreeing with each other for six months.

The failure is always the same shape. You add a scope to a token and forget to add it to `scopes_supported`. Now your protected-resource metadata advertises a permission vocabulary your tokens do not carry. Nothing fails loudly. An agent reads the metadata, requests the scope, gets a token without it, and the tool call 403s with no explanation anywhere in the chain.

So in this kit, **one file generates every surface**:

```
agent.config.ts
   |
   +--> /.well-known/ai-agent.json          +--> /llms.txt
   +--> /.well-known/agent-card.json        +--> /auth.md
   +--> /.well-known/mcp.json               +--> /robots.txt
   +--> /.well-known/api-catalog            +--> /openapi.json
   +--> /.well-known/oauth-protected-resource
   +--> /.well-known/oauth-protected-resource/api/mcp
   +--> /.well-known/agent-skills/index.json
   +--> the MCP tool catalog, the WebMCP script, the developer portal
```

Change a scope in one place. Eleven surfaces move together.

---

## Quick start

```bash
git clone <this repo> my-product && cd my-product
npm install
npm run dev
```

Then open `http://localhost:3000`. Everything already works.

### Make it yours, in three edits

1. **`agent.config.ts`** — product name, canonical host, scope vocabulary, tiers.
2. **`lib/room.ts`** — delete it. This is the demo domain. Put your product here.
3. **`lib/mcp/tools.ts`** — your tools. Keep at least one with `scope: null` (see below).

Everything else keeps working, because it reads from step 1 rather than from your feature code.

### Deploy

```bash
vercel --prod
```

Then set the canonical host in `agent.config.ts` to your real domain and redeploy. **Do not skip this**: the host is baked into every discovery document, and a manifest pointing at the wrong origin fails in a way that looks like an auth bug.

### Storage

Without KV, writes live in an in-process `Map`. That is fine for `next dev` and **wrong on any serverless host**, where each invocation may land in a fresh instance, so writes appear to succeed and then vanish with nothing erroring.

```bash
vercel env add KV_REST_API_URL
vercel env add KV_REST_API_TOKEN
```

Any Upstash-protocol KV works: Vercel KV, Upstash, or your own `serverless-redis-http`. `/api/v1/health` reports `degraded` and the homepage shows a banner until you set these, because the silent version of this problem is much worse than a loud one.

---

## The five things worth copying even if you throw the rest away

### 1. Ship at least one token-free tool

A grader, and any agent deciding whether you are worth connecting to, calls `tools/list` **anonymously**. If every tool requires a token, that list comes back empty and your entire execution surface is invisible to the thing evaluating it. You get judged as having no tools at all.

In `lib/mcp/tools.ts`, `scope: null` means anonymous. Three of the seven tools here are, and they are not stubs: an agent can understand the product, learn how to authenticate, and read real content before any human has approved anything.

### 2. Anything a scanner reads from your HTML must be in the served bytes

WebMCP registered from a React `useEffect` **ships, deploys, rescans and moves nothing**. The effect lives in a hashed JS chunk and does not run until hydration, so the served HTML contains no tool surface. The identical code in a server-rendered inline script took that check from 1/5 to 5/5 on a real target.

See `app/WebMcpInline.tsx`. Verify it the only way that counts:

```bash
curl -s https://your-domain/ | grep -c registerTool    # must be > 0
```

### 3. An agent must not be able to give itself credentials

`lib/device.ts` is RFC 8628 device code. The agent gets a short code; a **human** opens a URL on a device they trust, sees the exact scope list in plain language, and approves or does not.

The audit trail then reads: *a signed-in human approved these five scopes for an agent calling itself X at this timestamp.* That is a sentence that survives a security review. "The agent had an API key" is not.

Scopes are **frozen at mint time**. There is deliberately no widen-a-token path: widening after approval means the human approved something other than what exists.

### 4. Errors need a `remedy` field

An agent that receives `{"error":"forbidden"}` retries the same call forever. An agent that receives the missing scope name and the URL that fixes it recovers without a human.

Every error in `lib/errors.ts` is RFC 9457 `application/problem+json` and carries `code` plus `remedy`. Try it:

```bash
curl -s -X POST localhost:3000/api/v1/posts -H 'content-type: application/json' -d '{"text":"x"}'
```

### 5. Being agent-ready is mostly being a good API product

The heaviest checks on the ora board are `openapi-spec` and `public-api` at **7 points each**, then the developer portal at 6. Each shiny well-known file is worth 1 to 2.

An MCP server bolted onto a weak REST API scores badly, and the MCP server is not the problem. Publishing an OpenAPI spec also **activates dormant checks**: on one real target the usability denominator grew from 81 to 150 behind a single spec, so expect your score to move more than 7 points, and expect new red checks to appear. Both are correct.

---

## What is in here

| Layer | Path | What it does |
|---|---|---|
| Config | `agent.config.ts` | The one source of truth |
| Discovery | `app/.well-known/*` | 7 generated documents |
| Readability | `app/llms.txt`, `app/auth.md`, `app/pricing.md` | Markdown surfaces |
| Identity | `lib/device.ts`, `lib/auth.ts`, `lib/scopes.ts` | RFC 8628 + RFC 9728 |
| Execution | `app/api/mcp`, `app/WebMcpInline.tsx` | MCP + WebMCP |
| Multiplayer | `app/api/a2a/[agent]` | Per-agent A2A, each one addressable |
| API product | `app/api/v1/*`, `app/openapi.json` | REST, OpenAPI 3.1, problem+json |
| Recovery | `app/api/agent/feedback`, `app/not-found.tsx` | How you learn your discovery drifted |
| Human UI | `app/page.tsx`, `app/approve`, `app/developers` | All server-rendered |

See [MODULES.md](MODULES.md) for what each one is worth and what breaks if you delete it.

---

## Verify

```bash
npm run build      # typechecks every route
bash scripts/verify.sh https://your-domain   # 14 live assertions
python scripts/score.py your-domain.com      # both graders
```

### Two graders, and they do not measure the same thing

| | ora.ai | isitagentready.com |
|---|---|---|
| Reports | `100/100 A+` | `Level 5 Agent-Native` |
| Checks | ~125 over 4 weighted layers | 22 over 5 dimensions |
| Scan budget | **6 fresh scans/day** | none observed |
| Cadence | batch fixes, then scan once | rescan after each fix |

A site can hold **Level 5 and score 52 on ora at the same time**. One real property did exactly that for six weeks. Decide which number you are chasing before you start.

Four ops traps that cost real time:

- **Budget the day's six scans before you begin.** Mixing the two graders' cadences burns it by mid-morning.
- **Send the force/fresh parameter.** A cached response carries no per-check data, so an empty gap list renders as a clean bill of health. A client that cannot distinguish *nothing is wrong* from *I did not look* is worse than no client.
- **Pick one canonical host string and use it everywhere.** ora caches per input string; apex and www are two different rows that can read 98 and 100 minutes apart on the same site.
- **A green flip in a capped layer still proves your fix worked** even when the headline does not move. Record the flip, not just the number.

---

## License

MIT. Take it.
