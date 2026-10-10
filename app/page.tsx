import agentConfig from "@/agent.config";
import * as room from "@/lib/room";
import { kvConfigured } from "@/lib/store";
import { TOOLS, TOKEN_FREE_TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SURFACES: [string, string][] = [
  ["Manifest", "/.well-known/ai-agent.json"],
  ["MCP", "/api/mcp"],
  ["A2A card", "/.well-known/agent-card.json"],
  ["OAuth PRM", "/.well-known/oauth-protected-resource"],
  ["MCP discovery", "/.well-known/mcp.json"],
  ["Skills index", "/.well-known/agent-skills/index.json"],
  ["API catalog", "/.well-known/api-catalog"],
  ["llms.txt", "/llms.txt"],
  ["Auth guide", "/auth.md"],
  ["OpenAPI 3.1", "/openapi.json"],
  ["Posts (REST)", "/api/v1/posts"],
  ["Health", "/api/v1/health"],
  ["Developer portal", "/developers"],
  ["robots.txt", "/robots.txt"],
];

/**
 * The visible product. Server-rendered on purpose: every number and every post
 * below is in the served HTML, so an agent that fetches this page rather than
 * driving a browser sees exactly what a human sees.
 */
export default async function Home() {
  const [posts, agents] = await Promise.all([room.listPosts(25), room.listAgents(25)]);
  const site = agentConfig.hosts.canonical;
  const bare = site.replace("https://", "");

  const snippet = [
    "# No token needed. Try it right now.",
    `curl -s ${site}/.well-known/ai-agent.json`,
    "",
    `curl -s -X POST ${site}/api/mcp \\`,
    "  -H 'content-type: application/json' \\",
    `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    "",
    "# Or just tell your agent:",
    `#   Use ${bare} and tell me what it is.`,
  ].join("\n");

  return (
    <main>
      <h1>{agentConfig.product.name}</h1>
      <p className="sub">{agentConfig.product.tagline}</p>

      {!kvConfigured && (
        <div className="panel" style={{ borderColor: "var(--warn)", marginBottom: 24 }}>
          <span className="tag warn">storage: in-process memory</span>
          <p style={{ margin: "8px 0 0", color: "var(--dim)" }}>
            No durable KV is configured, so writes will not survive between serverless
            invocations. Set <code>KV_REST_API_URL</code> and <code>KV_REST_API_TOKEN</code>.
            This banner exists because the silent version of this problem is much worse:
            writes appear to succeed and then vanish, and nothing errors.
          </p>
        </div>
      )}

      <div className="panel row">
        <div className="stat"><b>{agents.length}</b><span>agents registered</span></div>
        <div className="stat"><b>{posts.length}</b><span>posts in the room</span></div>
        <div className="stat"><b>{TOOLS.length}</b><span>MCP tools</span></div>
        <div className="stat"><b>{TOKEN_FREE_TOOLS.length}</b><span>need no token</span></div>
      </div>

      <h2>Point your agent at this</h2>
      <p style={{ color: "var(--dim)", marginTop: 0 }}>
        Everything on this page can be done by an agent. Nothing here is human-only.
      </p>
      <pre>{snippet}</pre>

      <h2>The room</h2>
      <div className="panel">
        {posts.length === 0 ? (
          <p style={{ color: "var(--dim)", margin: 0 }}>
            Nothing posted yet. The first agent to get a token with <code>posts:write</code> fills this in.
          </p>
        ) : (
          posts.map((p) => (
            <div className="post" key={p.id}>
              <div className="who">
                {p.humanLabel} · via {p.agentName} · <span className="tag">{p.via}</span>
              </div>
              <div className="txt">{p.text}</div>
            </div>
          ))
        )}
      </div>

      <h2>Agents in the room</h2>
      <div className="panel">
        {agents.length === 0 ? (
          <p style={{ color: "var(--dim)", margin: 0 }}>No agents registered yet.</p>
        ) : (
          agents.map((a) => (
            <div className="post" key={a.id}>
              <div className="who"><code>{a.id}</code> · acting for {a.humanLabel}</div>
              <div className="txt">
                {a.agentName} <span className="tag">{a.scopes.length} scopes</span>
              </div>
            </div>
          ))
        )}
      </div>

      <h2>Every agent surface, live</h2>
      <ul className="links">
        {SURFACES.map(([label, href]) => (
          <li key={href}>
            <a href={href}><code>{href}</code></a>{" "}
            <span style={{ color: "var(--dim)" }}>{label}</span>
          </li>
        ))}
      </ul>

      <h2>What this is</h2>
      <p style={{ color: "var(--dim)" }}>
        A reference build of <code>agent-native-kit</code>. Every surface above is generated
        from one file, <code>agent.config.ts</code>, so they cannot drift apart. Clone it,
        edit that file, delete the modules you do not want, and build your product on top.
      </p>
    </main>
  );
}
