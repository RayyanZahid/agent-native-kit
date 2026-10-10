import agentConfig from "@/agent.config";
import { TOKEN_FREE_TOOLS } from "@/lib/mcp/tools";

/**
 * WebMCP registration as a SERVER-RENDERED INLINE SCRIPT.
 *
 * ================== THE LESSON THIS FILE ENCODES ==================
 * The identical registration written in a React `useEffect` ships, deploys,
 * rescans and moves NOTHING. The effect lives in a hashed JS chunk and does not
 * run until hydration, so anything reading the SERVED HTML — a scanner, a
 * crawler, an agent that fetches the page rather than driving a browser — sees
 * no tool surface at all. On a real target this check sat at 1/5 until the same
 * code moved into a server-rendered inline script, which took it to 5/5.
 *
 * ANYTHING A SCANNER READS FROM YOUR HTML MUST BE IN THE SERVED BYTES. That
 * sentence is the single highest-leverage thing in this whole repo.
 *
 * VERIFY IT, do not assume:
 *   curl -s https://your-domain/ | grep -c registerTool    # must be > 0
 * ==================================================================
 *
 * Also keep: the retry loop (an agent runtime often injects
 * document.modelContext AFTER parse, so a one-shot check finds nothing), the
 * two-host document/navigator fallback, and plain ES5 syntax, because an
 * agent's embedded browser is not guaranteed to parse optional chaining.
 */
/**
 * The tool list is DERIVED from lib/mcp/tools.ts (the same array the MCP server
 * serves), so renaming or adding a token-free tool there updates WebMCP too.
 * Each WebMCP tool just forwards to the MCP endpoint's tools/call, so behaviour
 * cannot drift from the server either. Only token-free tools are exposed: a
 * page cannot hold a bearer token.
 */
const WEB_TOOLS = TOKEN_FREE_TOOLS.map(({ name, description, inputSchema }) => ({
  name, description, inputSchema,
}));

const SCRIPT = `
(function () {
  if (window.__floorWebMcpRegistered) return;
  var MCP = ${JSON.stringify(agentConfig.mcp.path)};
  var defs = ${JSON.stringify(WEB_TOOLS).replace(/</g, "\\u003c")};
  var rpcId = 0;
  function call(name) {
    return function (args) {
      return fetch(MCP, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name: name, arguments: args || {} } })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.result) return j.result;
          var msg = j && j.error ? j.error.message : "request failed";
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: msg }) }], isError: true };
        })
        .catch(function (e) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: String(e) }) }], isError: true };
        });
    };
  }
  var tools = defs.map(function (d) {
    return { name: d.name, description: d.description, inputSchema: d.inputSchema, execute: call(d.name) };
  });

  function attempt() {
    if (window.__floorWebMcpRegistered) return true;
    var hosts = [
      typeof document !== "undefined" ? document.modelContext : null,
      typeof navigator !== "undefined" ? navigator.modelContext : null
    ];
    for (var i = 0; i < hosts.length; i++) {
      var h = hosts[i];
      if (!h) continue;
      try {
        if (typeof h.registerTool === "function") {
          for (var j = 0; j < tools.length; j++) h.registerTool(tools[j]);
          window.__floorWebMcpRegistered = true;
          return true;
        }
        if (typeof h.provideContext === "function") {
          var p = h.provideContext({ tools: tools });
          if (p && typeof p.catch === "function") p.catch(function () {});
          window.__floorWebMcpRegistered = true;
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  if (attempt()) return;
  var tries = 0;
  var t = setInterval(function () { if (attempt() || ++tries > 40) clearInterval(t); }, 250);
})();
`.trim();

export function WebMcpInline() {
  return (
    <script
      id="floor-webmcp-inline"
      type="text/javascript"
      // Static string built at module scope from constants. No request data
      // reaches it, so there is nothing here for a caller to inject into.
      dangerouslySetInnerHTML={{ __html: SCRIPT }}
    />
  );
}
