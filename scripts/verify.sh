#!/usr/bin/env bash
# Live assertions against a deployed agent-native-kit.
#   bash scripts/verify.sh https://your-domain
#
# Every check here is something a grader or a real agent actually reads. None of
# them trust a config file; they all read the wire.
#
# PASS / WARN / FAIL. Only FAIL exits non-zero. WARN means "works, but you have
# not finished making it yours or production-ready" (placeholder contact, memory
# storage, default canonical host). A WARN always prints its fix.
#
# Nothing here depends on the example app: the REST checks are derived from the
# site's own /openapi.json, so replacing the room demo with your product does
# not break verify. It is a superset of the workshop's online checker (durable
# storage, MCP discovery, A2A reachability), so a green run here is not weaker.
set -u
PY=$(command -v python3 || command -v python) || { echo "verify.sh needs python3"; exit 2; }
B="${1:-http://localhost:3000}"
PASS=0; FAIL=0; WARN=0

ok()   { printf '  PASS  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  WARN  %s\n' "$1"; WARN=$((WARN+1)); }
skip() { printf '  skip  %s\n' "$1"; }

# -s, not -sf: some documents (health) legitimately answer 503 with a body
# worth reading.
json_get() { curl -s "$B$1" 2>/dev/null; }

# JSON on stdin, a python snippet using `d`; prints whatever the snippet prints.
# A parse failure or exception prints nothing, so callers test for empty output.
py_json() {
  "$PY" -c 'import json,sys
try:
    d=json.load(sys.stdin)
    exec(sys.argv[1])
except Exception:
    sys.exit(3)' "$1" 2>/dev/null | tr -d '\015'
}

check_json() { # url, python expr over d, label
  local body; body=$(curl -sf "$B$1" 2>/dev/null) || { bad "$3 (fetch failed)"; return; }
  if echo "$body" | "$PY" -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if ($2) else 1)" 2>/dev/null; then
    ok "$3"
  else
    bad "$3"
  fi
}

check_ctype() { # url, expected substring, label
  local ct; ct=$(curl -sf -o /dev/null -w '%{content_type}' "$B$1" 2>/dev/null) || { bad "$3 (fetch failed)"; return; }
  case "$ct" in *"$2"*) ok "$3" ;; *) bad "$3 (got: $ct)" ;; esac
}

echo "Verifying $B"
echo
echo "Layer 1 - Discovery"
check_json  "/.well-known/ai-agent.json" "'interfaces' in d and 'mcp' in d['interfaces']" "ai-agent.json has an mcp interface"
check_json  "/.well-known/agent-card.json" "len(d.get('skills',[])) > 0 and all('id' in s and 'supportedInterfaces' in s for s in d['skills'])" "A2A card skills carry id + supportedInterfaces"
check_json  "/.well-known/mcp.json" "len(d.get('servers',[])) > 0" "mcp.json lists a server"
check_json  "/.well-known/oauth-protected-resource" "len(d.get('scopes_supported',[])) > 0" "PRM declares scopes_supported"
check_json  "/.well-known/oauth-protected-resource/api/mcp" "d.get('resource','').endswith('/api/mcp')" "RFC 9728 path-inserted PRM resolves to the MCP URL"
check_json  "/.well-known/agent-skills/index.json" "len(d.get('skills',[])) > 0" "agent-skills index is populated"
check_ctype "/.well-known/api-catalog" "linkset" "api-catalog served as application/linkset+json"

echo
echo "Layer 2 - Machine-readable"
check_ctype "/llms.txt" "text/plain" "llms.txt served as text/plain"
if [ "$(curl -sf "$B/llms.txt" | wc -c)" -lt 30000 ]; then ok "llms.txt under the 30,000 budget"; else bad "llms.txt over budget"; fi
check_ctype "/auth.md" "text/markdown" "auth.md served as text/markdown"
check_ctype "/pricing.md" "text/markdown" "pricing.md exists (required even when free)"
check_ctype "/SKILL.md" "text/markdown" "SKILL.md served as text/markdown (the agent entry point)"
if curl -sf "$B/llms.txt" | grep -Eq '\]\(https?://'; then ok "llms.txt carries markdown links"; else bad "llms.txt has no markdown links"; fi
for MD in /SKILL.md /auth.md /pricing.md /index.md; do
  FM=$(curl -sf "$B$MD" | head -8)
  if echo "$FM" | head -1 | grep -q '^---' && for K in title description canonical last-updated; do echo "$FM" | grep -q "^$K:" || exit 1; done; then
    ok "$MD opens with frontmatter (title, description, canonical, last-updated)"
  else
    bad "$MD is missing frontmatter (title, description, canonical, last-updated)"
  fi
done
HOME_HTML=$(curl -sf "$B/")
if echo "$HOME_HTML" | grep -q 'application/ld+json'; then ok "homepage has JSON-LD in the served HTML"; else bad "homepage has no JSON-LD"; fi
for M in 'rel="canonical"' 'property="og:image"' 'property="og:type"'; do
  if echo "$HOME_HTML" | grep -q "$M"; then ok "homepage head has $M"; else bad "homepage head is missing $M"; fi
done
# Every door should lead to SKILL.md first: homepage HTML, llms.txt, manifest.
if curl -sf "$B/" | grep -q 'SKILL.md'; then ok "homepage HTML points agents at SKILL.md"; else bad "homepage HTML does not mention SKILL.md"; fi
if curl -sf "$B/llms.txt" | grep -q 'SKILL.md'; then ok "llms.txt points agents at SKILL.md"; else bad "llms.txt does not mention SKILL.md"; fi
if json_get "/.well-known/ai-agent.json" | grep -q 'SKILL.md'; then ok "ai-agent.json points agents at SKILL.md"; else bad "ai-agent.json does not mention SKILL.md"; fi

echo
echo "Layer 4 - Execution"
N=$(curl -sf "$B/" | grep -c registerTool || true)
if [ "${N:-0}" -gt 0 ]; then ok "WebMCP registerTool present in SERVED bytes ($N)"; else bad "WebMCP NOT in served bytes - the useEffect trap"; fi

TL=$(curl -sf -X POST "$B/api/mcp" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 2>/dev/null)
if echo "$TL" | "$PY" -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if len(d['result']['tools'])>0 else 1)" 2>/dev/null; then
  ok "tools/list returns tools ANONYMOUSLY ($(echo "$TL" | "$PY" -c 'import json,sys; print(len(json.load(sys.stdin)["result"]["tools"]))') tools)"
else
  bad "tools/list is empty or gated - your execution surface is invisible"
fi

# Tool names come from the live tools/list, not from this script: a tool with no
# _meta.requiredScope is token-free; one with it is gated. Renaming tools in
# lib/mcp/tools.ts therefore needs no edit here.
FREE_TOOL=$(echo "$TL" | "$PY" -c "import json,sys; t=json.load(sys.stdin)['result']['tools']; f=[x['name'] for x in t if not x.get('_meta',{}).get('requiredScope')]; print(f[0] if f else '')" 2>/dev/null)
GATED_TOOL=$(echo "$TL" | "$PY" -c "import json,sys; t=json.load(sys.stdin)['result']['tools']; f=[x['name'] for x in t if x.get('_meta',{}).get('requiredScope')]; print(f[0] if f else '')" 2>/dev/null)

if [ -n "$FREE_TOOL" ]; then
  AC=$(curl -sf -X POST "$B/api/mcp" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$FREE_TOOL\",\"arguments\":{}}}" 2>/dev/null)
  if echo "$AC" | grep -q '"result"'; then ok "a token-free tool ($FREE_TOOL) actually executes with no auth"; else bad "token-free tool $FREE_TOOL did not execute"; fi
else
  bad "no token-free tool in tools/list"
fi

if [ -n "$GATED_TOOL" ]; then
  WWW=$(curl -s -D- -o /dev/null -X POST "$B/api/mcp" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"$GATED_TOOL\",\"arguments\":{}}}" | grep -ci 'www-authenticate' || true)
  if [ "${WWW:-0}" -gt 0 ]; then ok "401 on $GATED_TOOL carries WWW-Authenticate pointing at PRM"; else bad "401 has no WWW-Authenticate - strict clients cannot discover auth"; fi
else
  bad "no gated tool in tools/list to check the 401 against"
fi

# Annotations + schemas: what a client reads to decide what it may auto-approve.
BADTOOLS=$(echo "$TL" | py_json "
hints=('readOnlyHint','destructiveHint','idempotentHint','openWorldHint')
bad=[x['name'] for x in d['result']['tools'] if not all(isinstance(x.get('annotations',{}).get(h),bool) for h in hints) or x.get('inputSchema',{}).get('type')!='object']
print(','.join(bad) or 'none')")
if [ "$BADTOOLS" = "none" ]; then ok "every tool declares all four annotations and an object inputSchema"; else bad "tools missing annotations or inputSchema: ${BADTOOLS:-unreadable tools/list}"; fi

# MCP discovery: mcp.json, the server card and the server itself must agree.
MURL=$(json_get "/.well-known/mcp.json" | py_json "print(d['servers'][0]['url'])")
MPATH=$(echo "$MURL" | sed -E 's#^https?://[^/]+##')
if [ -n "$MPATH" ]; then
  INIT=$(curl -s -X POST "$B$MPATH" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":9,"method":"initialize","params":{}}' 2>/dev/null)
  if [ -n "$(echo "$INIT" | py_json "print(d['result']['serverInfo']['name'])")" ]; then
    ok "MCP discovery: mcp.json -> $MPATH answers initialize"
    if echo "$INIT" | grep -q 'SKILL.md'; then ok "MCP initialize instructions point at SKILL.md"; else bad "MCP initialize instructions do not mention SKILL.md"; fi
  else
    bad "MCP discovery: mcp.json points at $MPATH but initialize does not answer there"
  fi
else
  bad "MCP discovery: mcp.json lists no server url"
fi
SCN=$(json_get "/.well-known/mcp/server-card.json" | py_json "print(len(d['tools']))")
TLN=$(echo "$TL" | py_json "print(len(d['result']['tools']))")
if [ -n "$SCN" ] && [ "$SCN" = "$TLN" ]; then ok "MCP server card lists the same $SCN tools as tools/list"; else bad "MCP server card missing or disagrees with tools/list (card=${SCN:-none} list=${TLN:-none})"; fi

# Every advertised scope must be required by some tool, or the vocabulary
# promises a permission nothing enforces.
SCOPES=$(json_get "/.well-known/oauth-protected-resource" | py_json "print(' '.join(d.get('scopes_supported',[])))")
USED=$(echo "$TL" | py_json "print(' '.join(x.get('_meta',{}).get('requiredScope','') for x in d['result']['tools']))")
UNUSED=""
for S in $SCOPES; do case " $USED " in *" $S "*) ;; *) UNUSED="$UNUSED $S" ;; esac; done
if [ -z "$UNUSED" ]; then ok "every advertised scope is required by at least one tool"; else warn "advertised scopes no tool requires:$UNUSED (remove them from scopes in agent.config.ts, or use them)"; fi

# A2A: a card that validates is not an endpoint that exists. Call what it advertises.
AURL=$(json_get "/.well-known/agent-card.json" | py_json "print(d.get('url',''))")
APATH=$(echo "$AURL" | sed -E 's#^https?://[^/]+##')
if [ -n "$APATH" ]; then
  AOUT=$(curl -s -w '\n%{http_code}' -X POST "$B$APATH" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"agent/getCard"}' 2>/dev/null)
  ACODE=$(echo "$AOUT" | tail -1); ABODY=$(echo "$AOUT" | sed '$d')
  if [ "$ACODE" != "404" ] && [ "$ACODE" != "405" ] && [ "$(echo "$ABODY" | py_json "print(d.get('jsonrpc',''))")" = "2.0" ]; then
    ok "A2A: the card's url ($APATH) answers JSON-RPC (HTTP $ACODE)"
  else
    bad "A2A: the card advertises $APATH but it does not answer JSON-RPC (HTTP $ACODE). Build the endpoint or stop advertising it"
  fi
else
  skip "A2A: the card advertises no url"
fi

echo
echo "Layer 5 - Operations"
STORE=$(json_get "/api/v1/health" | py_json "print(d.get('storage',''))")
case "$STORE" in
  kv) ok "durable storage: KV configured" ;;
  "") bad "health: /api/v1/health did not return a storage field" ;;
  *) warn "storage is '$STORE': writes will not survive between serverless invocations. Set KV_REST_API_URL and KV_REST_API_TOKEN before you deploy for real" ;;
esac

echo
echo "Layer 6 - API as product"
check_json  "/openapi.json" "d.get('openapi','').startswith('3.') and len(d.get('paths',{}))>0" "OpenAPI 3.x with paths"

# REST checks come from the site's own spec, never from a hardcoded example
# route: replace the demo with your product and these follow it.
OA=$(json_get "/openapi.json")
BASE=$(echo "$OA" | py_json "print(d['servers'][0]['url'])" | sed -E 's#^https?://[^/]+##')
TOKENLESS=$(echo "$OA" | py_json "
for path,item in d.get('paths',{}).items():
    op=item.get('get')
    if not op or path.endswith('/health') or 'servers' in item: continue
    if {} not in op.get('security',d.get('security',[])): continue
    if any(p.get('required') for p in op.get('parameters',[]) if 'in' in p): continue
    print(path)" | head -3)
if [ -z "$TOKENLESS" ]; then
  skip "tokenless REST read: skipped, the spec has no tokenless GET route without required params"
else
  for P in $TOKENLESS; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "$B$BASE$P")
    if [ "$CODE" = "200" ]; then ok "GET $BASE$P is TOKENLESS (from openapi.json)"; else bad "GET $BASE$P is declared tokenless in openapi.json but answered HTTP $CODE"; fi
  done
fi

GATEDPOST=$(echo "$OA" | py_json "
for path,item in d.get('paths',{}).items():
    op=item.get('post')
    if op and 'servers' not in item and op.get('requestBody') and {'bearerAuth':[]} in op.get('security',[]):
        print(path); break")
if [ -z "$GATEDPOST" ]; then
  skip "error remedy: skipped, the spec has no bearer-protected POST route"
else
  if [ -n "$(curl -s -X POST "$B$BASE$GATEDPOST" -H 'content-type: application/json' -d '{}' | py_json "print(d.get('remedy',''))")" ]; then
    ok "errors carry a remedy field (POST $BASE$GATEDPOST, no token)"
  else
    bad "errors have no remedy (POST $BASE$GATEDPOST) - agents will retry forever"
  fi
fi
echo "  note  RateLimit-* headers appear on authenticated writes, not public reads"

echo
echo "Layer 7 - Made yours"
CONTACT=$(json_get "/.well-known/ai-agent.json" | py_json "print(d.get('contact',''))")
case "$CONTACT" in
  ""|*TODO-*|*@example.com|*@example.org) warn "contact is still a placeholder (${CONTACT:-empty}): set product.contact in agent.config.ts" ;;
  *) ok "contact is set ($CONTACT)" ;;
esac
RES=$(json_get "/.well-known/oauth-protected-resource" | py_json "print(d.get('resource','').rstrip('/'))")
BNORM="${B%/}"
if [ "$RES" = "$BNORM" ]; then
  ok "discovery documents reference this origin ($RES)"
else
  case "$RES" in
    *agent-native-kit.vercel.app*) warn "discovery documents point at $RES, the kit's default, not $BNORM. Set hosts.canonical to your real domain, add this host (with port) to hosts.allowed, and rebuild" ;;
    *) warn "discovery documents point at ${RES:-nothing} but you verified $BNORM. If $BNORM is meant to be served, add its host (with port) to hosts.allowed in agent.config.ts and rebuild" ;;
  esac
fi

echo
printf 'PASS %s   WARN %s   FAIL %s\n' "$PASS" "$WARN" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
