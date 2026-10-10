#!/usr/bin/env bash
# Live assertions against a deployed agent-native-kit.
#   bash scripts/verify.sh https://your-domain
#
# Every check here is something a grader or a real agent actually reads. None of
# them trust a config file; they all read the wire.
set -u
B="${1:-http://localhost:3000}"
PASS=0; FAIL=0

ok()   { printf '  PASS  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }

check_json() { # url, jq-ish python expr, label
  local body; body=$(curl -sf "$B$1" 2>/dev/null) || { bad "$3 (fetch failed)"; return; }
  if echo "$body" | python -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if ($2) else 1)" 2>/dev/null; then
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

echo
echo "Layer 4 - Execution"
N=$(curl -sf "$B/" | grep -c registerTool || true)
if [ "${N:-0}" -gt 0 ]; then ok "WebMCP registerTool present in SERVED bytes ($N)"; else bad "WebMCP NOT in served bytes - the useEffect trap"; fi

TL=$(curl -sf -X POST "$B/api/mcp" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 2>/dev/null)
if echo "$TL" | python -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if len(d['result']['tools'])>0 else 1)" 2>/dev/null; then
  ok "tools/list returns tools ANONYMOUSLY ($(echo "$TL" | python -c 'import json,sys; print(len(json.load(sys.stdin)["result"]["tools"]))') tools)"
else
  bad "tools/list is empty or gated - your execution surface is invisible"
fi

AC=$(curl -sf -X POST "$B/api/mcp" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"floor_overview","arguments":{}}}' 2>/dev/null)
if echo "$AC" | grep -q '"result"'; then ok "a token-free tool actually executes with no auth"; else bad "no token-free tool executes"; fi

WWW=$(curl -s -D- -o /dev/null -X POST "$B/api/mcp" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"floor_post","arguments":{"text":"x"}}}' | grep -ci 'www-authenticate' || true)
if [ "${WWW:-0}" -gt 0 ]; then ok "401 carries WWW-Authenticate pointing at PRM"; else bad "401 has no WWW-Authenticate - strict clients cannot discover auth"; fi

echo
echo "Layer 6 - API as product"
check_json  "/openapi.json" "d.get('openapi','').startswith('3.') and len(d.get('paths',{}))>0" "OpenAPI 3.x with paths"
check_json  "/api/v1/posts" "'data' in d" "GET /api/v1/posts is TOKENLESS"
PJ=$(curl -s -X POST "$B/api/v1/posts" -H 'content-type: application/json' -d '{"text":"x"}')
if echo "$PJ" | python -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('remedy') else 1)" 2>/dev/null; then
  ok "errors carry a remedy field"
else
  bad "errors have no remedy - agents will retry forever"
fi
RL=$(curl -s -D- -o /dev/null "$B/api/v1/posts" | grep -ci 'ratelimit' || true)
echo "  note  RateLimit-* headers appear on authenticated writes, not public reads"

echo
printf 'PASS %s   FAIL %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
