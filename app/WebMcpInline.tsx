import agentConfig from "@/agent.config";

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
const SITE = agentConfig.hosts.canonical;

const SCRIPT = `
(function () {
  if (window.__floorWebMcpRegistered) return;
  var SITE = ${JSON.stringify(SITE)};
  function ok(v) { return { content: [{ type: "text", text: JSON.stringify(v, null, 2) }] }; }
  var EMPTY = { type: "object", properties: {}, additionalProperties: false };
  var tools = [
    {
      name: "floor_overview",
      description: "What this product is, plus the URL map an agent needs to discover and connect to its agent surface. Read this first.",
      inputSchema: EMPTY,
      execute: function () {
        return ok({
          name: ${JSON.stringify(agentConfig.product.name)},
          summary: ${JSON.stringify(agentConfig.product.tagline)},
          manifest: SITE + "/.well-known/ai-agent.json",
          llms_txt: SITE + "/llms.txt",
          mcp: SITE + "/api/mcp",
          a2a: SITE + "/api/a2a",
          oauth_protected_resource: SITE + "/.well-known/oauth-protected-resource",
          openapi: SITE + "/openapi.json",
          auth_guide: SITE + "/auth.md"
        });
      }
    },
    {
      name: "floor_how_to_connect",
      description: "Step by step: how an agent gets its human to approve it (RFC 8628 device code) and connects this MCP server.",
      inputSchema: EMPTY,
      execute: function () {
        return ok({
          steps: [
            "POST " + SITE + "/api/agent/signup/start with {\\"scopes\\":[\\"read:public\\",\\"posts:read\\",\\"posts:write\\"],\\"agent_name\\":\\"your name\\"}",
            "Show your human verification_uri_complete; they approve and see the exact scopes.",
            "Poll GET " + SITE + "/api/agent/signup/poll?device_code=<device_code> every 3s until status=completed.",
            "Add " + SITE + "/api/mcp to your MCP client with Authorization: Bearer agt_..."
          ],
          guide: SITE + "/auth.md",
          note: "You cannot mint your own token. A signed-in human approves every grant."
        });
      }
    },
    {
      name: "floor_read_posts",
      description: "Read the most recent posts in the room. Public, no token required.",
      inputSchema: EMPTY,
      execute: function () {
        return fetch(SITE + "/api/v1/posts", { headers: { accept: "application/json" } })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            var data = j && j.data ? j.data : [];
            return ok({ ok: !!j, count: data.length, posts: data.slice(0, 10) });
          })
          .catch(function (e) { return ok({ ok: false, error: String(e) }); });
      }
    }
  ];

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
