#!/usr/bin/env python3
"""Live agent-readiness checks against ANY site, read off the wire.

    python3 scripts/verify.py https://your-domain [--json]
    bash scripts/verify.sh https://your-domain          # same thing

Nothing here assumes this kit's routes or tool names. Every address is
discovered from the site's own documents: the MCP endpoint from mcp.json (or
ai-agent.json), the RFC 9728 path from that endpoint, tools from tools/list,
REST routes from openapi.json, the health route from openapi.json. A site built
on something else gets the same checks.

Every FAIL and WARN carries WHY it matters and the FIX, and the run ends with
the failures to fix first, most blocking first. Run inside an agent-native-kit
checkout (agent.config.ts present) and fixes also name the kit file to edit.

PASS / WARN / FAIL. Only FAIL exits non-zero. WARN means it works but is not
finished (placeholder contact, memory storage, unused scope). `skip` means the
check does not apply to this site, and says why.

Safety: the only tool this calls is one the site itself marks readOnlyHint with
no required inputs. A gated tool is called WITHOUT a token, which a correct
server refuses. Nothing here can write to the site.

A site can add its own checks in scripts/verify_site.py next to this file:
define `def checks(v):` and call v.check(...) the same way the built-in checks
do. Keep this file identical across sites and put site-specific checks there.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

UA = "agent-native-verify/2.0 (+https://github.com/RayyanZahid/agent-native-kit)"
TIMEOUT = 20
HERE = os.path.dirname(os.path.abspath(__file__))
IN_KIT = os.path.exists(os.path.join(HERE, "..", "agent.config.ts"))


class Resp:
    def __init__(self, status: int, headers: dict, body: bytes):
        self.status, self.headers, self.raw = status, headers, body

    @property
    def ctype(self) -> str:
        return self.headers.get("content-type", "")

    @property
    def text(self) -> str:
        return self.raw.decode("utf-8", "replace")

    def json(self):
        try:
            return json.loads(self.raw)
        except Exception:
            return None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # A redirect is reported, not followed: an endpoint that 307s elsewhere is
    # not the endpoint the document advertised.
    def redirect_request(self, *a, **k):
        return None


_opener = urllib.request.build_opener(NoRedirect)
_cache: dict = {}


def fetch(url: str, method="GET", body=None, headers=None) -> Resp | None:
    key = (url, method, json.dumps(body, sort_keys=True) if body is not None else None,
           json.dumps(headers or {}, sort_keys=True))
    if key in _cache:
        return _cache[key]
    h = {"user-agent": UA, **(headers or {})}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("content-type", "application/json")
        h.setdefault("accept", "application/json, text/event-stream")
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with _opener.open(req, timeout=TIMEOUT) as r:
            out = Resp(r.status, {k.lower(): v for k, v in r.headers.items()}, r.read())
    except urllib.error.HTTPError as e:
        out = Resp(e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, e.read() or b"")
    except Exception:
        out = None
    _cache[key] = out
    return out


def rpc_result(r: Resp | None):
    """JSON-RPC body from a JSON or single-event SSE response."""
    if not r:
        return None
    d = r.json()
    if d is None and "event-stream" in r.ctype:
        for line in r.text.splitlines():
            if line.startswith("data:"):
                try:
                    d = json.loads(line[5:].strip())
                except Exception:
                    pass
    return d if isinstance(d, dict) else None


def path_of(url: str) -> str:
    return urlsplit(url).path or "/"


class Verifier:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.findings: list[dict] = []
        self.layer = ""
        # Kit file hints only make sense when you are in a kit checkout AND the
        # site answers with agent documents; pointing someone checking a
        # foreign site at agent.config.ts is noise.
        self.kit_hints = False

    def url(self, path: str) -> str:
        return path if path.startswith("http") else self.base + path

    def get(self, path, **kw):
        return fetch(self.url(path), **kw)

    def section(self, name: str):
        self.layer = name
        if not JSON_OUT:
            print(f"\n{name}")

    def check(self, cid: str, status: str, label: str, why: str = "", fix: str = "",
              kit: str = "", rank: int = 50):
        """status: pass | warn | fail | skip. rank: lower = fix earlier."""
        fix_full = fix + (f" In this kit: {kit}" if kit and self.kit_hints else "")
        f = {"id": cid, "layer": self.layer, "status": status, "label": label,
             "why": why if status in ("fail", "warn") else "",
             "fix": fix_full if status in ("fail", "warn") else "", "rank": rank}
        self.findings.append(f)
        if JSON_OUT:
            return
        tag = {"pass": "PASS", "warn": "WARN", "fail": "FAIL", "skip": "skip"}[status]
        print(f"  {tag}  {label}")
        if status in ("fail", "warn"):
            if why:
                print(f"        why: {why}")
            if fix_full:
                print(f"        fix: {fix_full}")

    def note(self, text: str):
        if not JSON_OUT:
            print(f"  note  {text}")


def ok(b) -> str:
    return "pass" if b else "fail"


# ---------------------------------------------------------------- the checks

def run(v: Verifier):
    home = v.get("/")
    if home is None:
        v.section("Reachability")
        v.check("reachable", "fail", f"{v.base} did not answer at all",
                "Nothing else can be checked until the site responds.",
                "Check the address, that the site is deployed, and that it is public.", rank=0)
        return

    manifest_r = v.get("/.well-known/ai-agent.json")
    manifest = manifest_r.json() if manifest_r and manifest_r.status == 200 else None
    mcpjson_r = v.get("/.well-known/mcp.json")
    mcpjson = mcpjson_r.json() if mcpjson_r and mcpjson_r.status == 200 else None
    v.kit_hints = IN_KIT and isinstance(manifest, dict)

    # ---------------------------------------------------------- Layer 1
    v.section("Layer 1 - Discovery")
    has_mcp_iface = isinstance(manifest, dict) and "mcp" in (manifest.get("interfaces") or {})
    v.check("manifest", ok(has_mcp_iface), "ai-agent.json is served and has an mcp interface",
            "This is the document every other address hangs off. An agent that cannot read it does not know you have tools.",
            "Serve /.well-known/ai-agent.json as JSON with name, description and interfaces.mcp.url.",
            kit="It is generated from agent.config.ts; check product and mcp there, then rebuild.", rank=1)

    card_r = v.get("/.well-known/agent-card.json")
    card = card_r.json() if card_r and card_r.status == 200 else None
    if card is None:
        v.check("a2a-card", "skip", "A2A agent card: none published (optional)")
    else:
        skills = card.get("skills") or []
        v.check("a2a-card", ok(skills and all("id" in s and "supportedInterfaces" in s for s in skills)),
                "A2A card skills carry id + supportedInterfaces",
                "A2A clients route by skill id and pick a transport from supportedInterfaces; without them the card is unusable.",
                "Give every skill in /.well-known/agent-card.json an id and a supportedInterfaces list.",
                kit="Skills come from a2a.skills in agent.config.ts.")

    servers = (mcpjson or {}).get("servers") or []
    v.check("mcp-json", ok(len(servers) > 0), "mcp.json lists a server",
            "Clients that discover MCP by convention read /.well-known/mcp.json first.",
            "Serve /.well-known/mcp.json with a servers list, each entry carrying a url.", rank=10)

    # Where is the MCP server? mcp.json, then ai-agent.json. Never assumed.
    mcp_url = ""
    if servers and isinstance(servers[0], dict):
        mcp_url = servers[0].get("url", "")
    if not mcp_url and has_mcp_iface:
        m = manifest["interfaces"]["mcp"]
        mcp_url = m if isinstance(m, str) else (m or {}).get("url", "")
    mcp_path = path_of(mcp_url) if mcp_url else ""

    prm_r = v.get("/.well-known/oauth-protected-resource")
    prm = prm_r.json() if prm_r and prm_r.status == 200 else None
    v.check("prm", ok(isinstance(prm, dict) and isinstance(prm.get("scopes_supported"), list)),
            "OAuth protected-resource metadata declares scopes_supported",
            "This is how a client learns which permissions exist before asking a human for a token.",
            "Serve /.well-known/oauth-protected-resource (RFC 9728) with resource, authorization_servers and scopes_supported (may be empty for a read-only product).",
            kit="Scopes come from `scopes` in agent.config.ts.")

    if mcp_path:
        pp = v.get("/.well-known/oauth-protected-resource" + mcp_path)
        d = pp.json() if pp and pp.status == 200 else None
        v.check("prm-path-inserted", ok(isinstance(d, dict) and str(d.get("resource", "")).rstrip("/").endswith(mcp_path.rstrip("/"))),
                f"RFC 9728 path-inserted metadata at /.well-known/oauth-protected-resource{mcp_path} names the MCP URL",
                "A strict MCP client that gets a 401 derives exactly this address from the MCP URL and does not fall back to the root one.",
                f"Serve the same metadata at /.well-known/oauth-protected-resource{mcp_path}, with resource set to the MCP URL.")
    else:
        v.check("prm-path-inserted", "skip", "RFC 9728 path-inserted metadata: no MCP URL to derive it from")

    sk = v.get("/.well-known/agent-skills/index.json")
    skd = sk.json() if sk and sk.status == 200 else None
    v.check("agent-skills", ok(isinstance(skd, dict) and len(skd.get("skills") or []) > 0),
            "agent-skills index is populated",
            "Agents that load skills look here for what your product teaches them to do.",
            "Serve /.well-known/agent-skills/index.json listing at least one skill (your SKILL.md).")

    ac = v.get("/.well-known/api-catalog")
    v.check("api-catalog", ok(bool(ac) and ac.status == 200 and "linkset" in ac.ctype),
            "api-catalog served as application/linkset+json",
            "RFC 9727: the standard place a crawler finds your APIs. Graders read the content type, not the body.",
            "Serve /.well-known/api-catalog with content-type application/linkset+json, linking openapi.json.")

    # ---------------------------------------------------------- Layer 2
    v.section("Layer 2 - Machine-readable")
    llms = v.get("/llms.txt")
    llms_ok = bool(llms) and llms.status == 200
    v.check("llms-txt", ok(llms_ok and "text/plain" in llms.ctype), "llms.txt served as text/plain",
            "The first file a language model reads about a site. Served as HTML, it is a web page, not a briefing.",
            "Serve /llms.txt as text/plain: what the product is, when to use it, and links to the rest.", rank=20)
    if llms_ok:
        v.check("llms-budget", ok(len(llms.raw) < 30000), f"llms.txt under the 30,000 character budget ({len(llms.raw)})",
                "Readers truncate long files, and what is cut is usually the part that said what to do.",
                "Move detail into linked pages and keep llms.txt to the map.")
        v.check("llms-links", ok(re.search(r"\]\(https?://", llms.text)), "llms.txt carries markdown links",
                "Links are how a reader gets from the summary to the documents that matter.",
                "Write links as [title](https://...) so they are followable.")

    for path, cid, why in [
        ("/SKILL.md", "skill-md", "The entry point that tells an agent how to use your product, step by step."),
        ("/auth.md", "auth-md", "How an agent gets a token. Without it, every gated tool is a dead end."),
        ("/pricing.md", "pricing-md", "Agents check cost before acting for someone. Publish it even when free, or they assume the worst."),
    ]:
        r = v.get(path)
        v.check(cid, ok(bool(r) and r.status == 200 and "markdown" in r.ctype), f"{path} served as text/markdown",
                why, f"Serve {path} with content-type text/markdown.")

    for path in ("/SKILL.md", "/auth.md", "/pricing.md", "/index.md"):
        r = v.get(path)
        head = (r.text if r and r.status == 200 else "").splitlines()[:10]
        good = bool(head) and head[0].strip() == "---" and all(any(l.startswith(k + ":") for l in head) for k in ("title", "description", "canonical", "last-updated"))
        v.check("frontmatter" + path, ok(good), f"{path} opens with frontmatter (title, description, canonical, last-updated)",
                "Frontmatter lets a reader tell which document this is, where it lives, and whether it is stale, without parsing prose.",
                f"Start {path} with a --- block holding title, description, canonical and last-updated.")

    md = v.get("/", headers={"accept": "text/markdown"})
    v.check("negotiate-md", ok(bool(md) and "markdown" in md.ctype), "/ answers Accept: text/markdown with markdown",
            "Agents that ask for markdown get a clean page instead of scraping HTML.",
            "When a request to / sends Accept: text/markdown, return index.md with content-type text/markdown.")

    html = home.text
    v.check("json-ld", ok("application/ld+json" in html), "homepage has JSON-LD in the served HTML",
            "Search engines and answer engines read structured data to say what the site is.",
            "Add a <script type=\"application/ld+json\"> block (WebSite or SoftwareApplication) to the server-rendered head.")
    for marker in ('rel="canonical"', 'property="og:image"', 'property="og:type"'):
        v.check("head:" + marker, ok(marker in html), f"homepage head has {marker}",
                "Link previews and crawlers read these from the served head, not from anything JavaScript adds later.",
                f"Add {marker} to the server-rendered <head>.")

    skill_why = "Every door should lead an agent to SKILL.md first; a door that does not is where agents start guessing."
    v.check("door-home", ok("SKILL.md" in html), "homepage HTML points agents at SKILL.md", skill_why,
            "Mention /SKILL.md in the served homepage HTML (a link or a line for agents).")
    v.check("door-llms", ok(llms_ok and "SKILL.md" in llms.text), "llms.txt points agents at SKILL.md", skill_why,
            "Link /SKILL.md near the top of llms.txt.")
    v.check("door-manifest", ok(manifest_r is not None and "SKILL.md" in manifest_r.text), "ai-agent.json points agents at SKILL.md",
            skill_why, "Reference /SKILL.md from ai-agent.json (for example under docs or skills).")

    # ---------------------------------------------------------- Layer 4
    v.section("Layer 4 - Execution")
    n = html.count("registerTool")
    v.check("webmcp", ok(n > 0), f"WebMCP registerTool present in the SERVED bytes ({n})",
            "A browsing agent sees only what the server sent. Registration inside a useEffect lives in a JS chunk and runs after hydration, so it is invisible.",
            "Register WebMCP tools in a server-rendered inline script, not in client-side code.", rank=5)

    tools: list = []
    tl = None
    if not mcp_path:
        v.check("mcp-endpoint", "fail", "no MCP endpoint found in mcp.json or ai-agent.json",
                "Without an advertised endpoint an agent has nothing to call, and every execution check below is skipped.",
                "Advertise your MCP URL in /.well-known/mcp.json servers[0].url and in ai-agent.json interfaces.mcp.url.", rank=2)
    else:
        tl = rpc_result(v.get(mcp_path, method="POST", body={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}))
        tools = ((tl or {}).get("result") or {}).get("tools") or []
        v.check("tools-list", ok(len(tools) > 0), f"tools/list at {mcp_path} returns tools ANONYMOUSLY ({len(tools)} tools)",
                "Anything evaluating you calls tools/list with no token. If every tool is gated, you are judged as having no tools.",
                "Let tools/list answer without a token and list every tool, gated or not; gate the CALL, not the listing.",
                kit="Give at least one tool scope: null in lib/mcp/tools.ts.", rank=3)

    if mcp_path and tools:
        def required(t):
            return bool((t.get("inputSchema") or {}).get("required"))

        def scope_of(t):
            return (t.get("_meta") or {}).get("requiredScope")

        # Only a tool the site says is read-only and needs no input is called.
        free = [t for t in tools if not scope_of(t) and (t.get("annotations") or {}).get("readOnlyHint") is True and not required(t)]
        if free:
            name = free[0]["name"]
            r = rpc_result(v.get(mcp_path, method="POST", body={"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": name, "arguments": {}}}))
            good = bool(r) and "result" in r and not (r.get("result") or {}).get("isError")
            v.check("free-tool-runs", ok(good), f"a token-free read-only tool ({name}) executes with no auth",
                    "Listing a tool proves nothing; the first call an evaluator makes is the one that counts.",
                    f"Make {name} return a result without a token, or mark it with _meta.requiredScope if it needs one.", rank=4)
        else:
            v.check("free-tool-runs", "warn", "no tool is both token-free and marked readOnlyHint with no required input, so none was called",
                    "An evaluator wants one safe tool it can call blind to see that the server works.",
                    "Offer one read-only tool with no required input and no scope, annotated readOnlyHint: true.",
                    kit="Set scope: null and readOnlyHint: true on one tool in lib/mcp/tools.ts.")

        gated = [t for t in tools if scope_of(t)]
        if gated:
            name = gated[0]["name"]
            r = v.get(mcp_path, method="POST", body={"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": name, "arguments": {}}})
            www = bool(r) and r.status == 401 and "www-authenticate" in r.headers
            v.check("www-authenticate", ok(www), f"calling {name} with no token gives 401 + WWW-Authenticate",
                    "A strict client discovers how to sign in only from the WWW-Authenticate header on a 401. Anything else is a dead end.",
                    "Answer a gated call without a token with HTTP 401 and WWW-Authenticate: Bearer resource_metadata=\"<your PRM URL>\".")
        else:
            v.check("www-authenticate", "warn", "no tool declares a required scope, so the 401 path is untested",
                    "Fine for a read-only product. If anything should need a login, nothing here proves it does.",
                    "Mark tools that change things with _meta.requiredScope so clients know to ask for a token.",
                    kit="Add a tool with a scope in lib/mcp/tools.ts and this check will cover its 401.")

        hints = ("readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint")
        bad = [t.get("name", "?") for t in tools
               if not all(isinstance((t.get("annotations") or {}).get(h), bool) for h in hints)
               or (t.get("inputSchema") or {}).get("type") != "object"]
        v.check("annotations", ok(not bad), "every tool declares all four annotations and an object inputSchema"
                + (f" (missing: {', '.join(bad[:5])})" if bad else ""),
                "Clients decide what they may run without asking a human from these hints. A missing hint is treated as the worst case.",
                "Give every tool readOnlyHint, destructiveHint, idempotentHint and openWorldHint as booleans, and an inputSchema of type object.")

        init = rpc_result(v.get(mcp_path, method="POST", body={"jsonrpc": "2.0", "id": 9, "method": "initialize",
                                                                "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "verify", "version": "2"}}}))
        info = ((init or {}).get("result") or {}).get("serverInfo") or {}
        v.check("initialize", ok(bool(info.get("name"))), f"MCP initialize at {mcp_path} answers with serverInfo",
                "initialize is the first message every MCP client sends.",
                "Answer initialize with protocolVersion, capabilities and serverInfo.name.")
        if info.get("name"):
            instr = ((init or {}).get("result") or {}).get("instructions") or ""
            v.check("init-instructions", ok("SKILL.md" in instr), "MCP initialize instructions point at SKILL.md",
                    "instructions is the one paragraph a client shows its model on connect; it should send the model to the full guide.",
                    "Mention /SKILL.md in the instructions field of the initialize result.")

        sc = v.get("/.well-known/mcp/server-card.json")
        scd = sc.json() if sc and sc.status == 200 else None
        n_card = len((scd or {}).get("tools") or []) if isinstance(scd, dict) else None
        v.check("server-card", ok(n_card == len(tools)),
                f"MCP server card lists the same tools as tools/list (card={n_card if n_card is not None else 'none'}, list={len(tools)})",
                "A client reads the server card before connecting to decide whether to connect at all; without it, it connects blind.",
                "Serve /.well-known/mcp/server-card.json generated from the same tool list the server serves, so the two cannot drift.")

        scopes = (prm or {}).get("scopes_supported") or []
        used = {scope_of(t) for t in tools if scope_of(t)}
        unused = [s for s in scopes if s not in used]
        if scopes:
            v.check("unused-scopes", "pass" if not unused else "warn",
                    "every advertised scope is required by some tool" if not unused else f"advertised scopes no tool requires: {' '.join(unused)}",
                    "A scope nothing enforces is a permission people grant that does not mean anything.",
                    "Remove the unused scopes from scopes_supported, or give a tool that scope.",
                    kit="Delete the line from `scopes` in agent.config.ts (and from tiers if you listed it there), then rebuild.")
    elif mcp_path:
        v.note("tool checks skipped: tools/list returned nothing to check")

    a2a_url = (card or {}).get("url", "") if card else ""
    if a2a_url:
        ap = path_of(a2a_url)
        r = v.get(ap, method="POST", body={"jsonrpc": "2.0", "id": 1, "method": "agent/getCard"})
        d = r.json() if r else None
        status = r.status if r else "none"
        good = bool(r) and r.status not in (404, 405) and not (300 <= r.status < 400) and isinstance(d, dict) and d.get("jsonrpc") == "2.0"
        v.check("a2a-endpoint", ok(good), f"A2A: the card's url ({ap}) answers JSON-RPC (HTTP {status})",
                "A card that validates while its address 404s or redirects is the worst kind of drift: every static check passes and every real call fails.",
                f"Make POST {ap} answer JSON-RPC 2.0 (at least agent/getCard), or remove the url from the card." +
                (" It redirects; if the route exists in your code, the deployed build is older than the code." if r and 300 <= r.status < 400 else ""))

    # ---------------------------------------------------------- Layer 5
    v.section("Layer 5 - Operations")
    oa_r = v.get("/openapi.json")
    oa = oa_r.json() if oa_r and oa_r.status == 200 else None
    oa = oa if isinstance(oa, dict) else None
    oa_base = path_of(((oa or {}).get("servers") or [{}])[0].get("url", "")).rstrip("/") if oa and oa.get("servers") else ""
    health_paths = [p for p in ((oa or {}).get("paths") or {}) if p.rstrip("/").endswith("/health")]
    health_path = (oa_base + health_paths[0]) if health_paths else "/api/v1/health"
    h = v.get(health_path)
    hd = h.json() if h else None
    if not h or h.status == 404 or not isinstance(hd, dict):
        v.check("health", "skip", f"health: no health route found ({health_path})")
    else:
        store = hd.get("storage")
        if store is None:
            v.check("health", "pass", f"health route answers ({health_path}, HTTP {h.status})")
        elif store in ("kv", "redis", "postgres", "durable"):
            v.check("storage", "pass", f"durable storage: {store}")
        else:
            v.check("storage", "warn", f"storage is '{store}': writes will not survive between serverless invocations",
                    "In-process memory loses writes between invocations with nothing erroring, so it looks fine until it is not.",
                    "Configure durable storage before real traffic.",
                    kit="Set KV_REST_API_URL and KV_REST_API_TOKEN, then restart.")

    # ---------------------------------------------------------- Layer 6
    v.section("Layer 6 - API as product")
    has_paths = bool(oa) and str(oa.get("openapi", "")).startswith("3.") and len(oa.get("paths") or {}) > 0
    v.check("openapi", ok(has_paths), "OpenAPI 3.x document with paths at /openapi.json",
            "The heaviest single item on the public graders, and the map an agent uses to call your API without guessing.",
            "Serve /openapi.json (OpenAPI 3.x) describing every route, with security per operation.", rank=6)

    if has_paths:
        tokenless = []
        for p, item in oa["paths"].items():
            op = (item or {}).get("get")
            if not op or p.rstrip("/").endswith("/health") or "servers" in item or "{" in p:
                continue
            if {} not in op.get("security", oa.get("security", [])):
                continue
            if any(x.get("required") for x in op.get("parameters", []) if "in" in x):
                continue
            tokenless.append(p)
        if not tokenless:
            v.check("tokenless-get", "skip", "tokenless REST read: the spec declares no tokenless GET without required params")
        for p in tokenless[:3]:
            r = v.get(oa_base + p)
            v.check("tokenless-get" + p, ok(bool(r) and r.status == 200), f"GET {oa_base}{p} answers without a token (declared tokenless in openapi.json; HTTP {r.status if r else 'none'})",
                    "The spec promises this route works without a token; an agent that trusts it and gets refused stops trusting the spec.",
                    f"Either make GET {oa_base}{p} public or declare its security in openapi.json.")

        gated_post = ""
        for p, item in oa["paths"].items():
            op = (item or {}).get("post")
            if op and "servers" not in item and "{" not in p and op.get("security") and {} not in op.get("security", []):
                gated_post = p
                break
        if not gated_post:
            v.check("error-remedy", "skip", "error remedy: the spec declares no token-protected POST to probe")
        else:
            r = v.get(oa_base + gated_post, method="POST", body={})
            d = r.json() if r else None
            v.check("error-remedy", ok(isinstance(d, dict) and bool(d.get("remedy"))),
                    f"errors carry a remedy field (POST {oa_base}{gated_post}, no token)",
                    "An agent that gets an error with no next step retries the same call until it gives up.",
                    "Return errors as JSON with a remedy field saying what to do next (problem+json with an extra member is fine).")
    v.note("RateLimit-* headers appear on authenticated writes, not public reads, so they are not checked here")

    # ---------------------------------------------------------- Layer 7
    v.section("Layer 7 - Made yours")
    contact = str((manifest or {}).get("contact", "")) if isinstance(manifest, dict) else ""
    placeholder = (not contact) or "TODO-" in contact or contact.endswith(("@example.com", "@example.org"))
    v.check("contact", "warn" if placeholder else "pass",
            f"contact is still a placeholder ({contact or 'empty'})" if placeholder else f"contact is set ({contact})",
            "Agents and people need a real address when something breaks.",
            "Set contact in ai-agent.json to an address someone reads.",
            kit="Set product.contact in agent.config.ts.")
    res = str((prm or {}).get("resource", "")).rstrip("/") if isinstance(prm, dict) else ""
    if res == v.base:
        v.check("origin", "pass", f"discovery documents reference this origin ({res})")
    else:
        v.check("origin", "warn", f"discovery documents point at {res or 'nothing'}, but you verified {v.base}",
                "Agents follow the addresses inside the documents, so they end up on a different site from the one you checked.",
                "Make the resource and URLs in your discovery documents use the origin you serve.",
                kit=("hosts.canonical is still the kit default; set it to your domain, add this host to hosts.allowed, and rebuild."
                     if "agent-native-kit.vercel.app" in res else "Add this host (with port) to hosts.allowed in agent.config.ts and rebuild."))

    site = os.path.join(HERE, "verify_site.py")
    if os.path.exists(site):
        import importlib.util
        sys.dont_write_bytecode = True  # no __pycache__ left in the checkout
        spec = importlib.util.spec_from_file_location("verify_site", site)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        v.section("Site-specific (scripts/verify_site.py)")
        mod.checks(v)


JSON_OUT = False


def main(argv):
    global JSON_OUT
    args = [a for a in argv if not a.startswith("--")]
    JSON_OUT = "--json" in argv
    if "-h" in argv or "--help" in argv:
        print(__doc__)
        return 0
    base = args[0] if args else "http://localhost:3000"
    if not re.match(r"^https?://", base):
        base = "https://" + base
    v = Verifier(base)
    if not JSON_OUT:
        print(f"Verifying {v.base}")
    run(v)

    counted = [f for f in v.findings if f["status"] != "skip"]
    P = sum(f["status"] == "pass" for f in counted)
    W = sum(f["status"] == "warn" for f in counted)
    F = sum(f["status"] == "fail" for f in counted)
    order = {id(f): i for i, f in enumerate(v.findings)}
    first = sorted([f for f in v.findings if f["status"] == "fail"], key=lambda f: (f["rank"], order[id(f)]))[:3]

    if JSON_OUT:
        print(json.dumps({"target": v.base, "passed": P, "warned": W, "failed": F,
                          "fixFirst": [{"id": f["id"], "label": f["label"], "fix": f["fix"]} for f in first],
                          "findings": v.findings}, indent=2))
    else:
        print()
        print(f"PASS {P}   WARN {W}   FAIL {F}")
        if first:
            print("\nFix first:")
            for i, f in enumerate(first, 1):
                print(f"  {i}. FAIL  {f['label']}\n     {f['fix']}")
            if F > len(first):
                print(f"  ...then the other {F - len(first)} FAIL lines above, each with its fix.")
    return 1 if F else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
