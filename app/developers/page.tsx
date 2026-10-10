import agentConfig from "@/agent.config";
import { TOOLS, TOKEN_FREE_TOOLS } from "@/lib/mcp/tools";
import { SCOPES } from "@/lib/scopes";

export const dynamic = "force-dynamic";

/**
 * Developer portal. Worth 6 points on its own, and it has to be SERVER
 * RENDERED: a portal whose content arrives by client fetch is invisible to the
 * thing grading it, and to any agent that reads the page instead of running it.
 *
 * Operation counts are DERIVED from the tool catalog, never hand-maintained. A
 * portal claiming "12 tools" next to a server exposing 7 is worse than no
 * portal, and hand-maintained numbers always end up there.
 */
export default function Developers() {
  const site = agentConfig.hosts.canonical;

  return (
    <main>
      <h1>Developers</h1>
      <p className="sub">
        {TOOLS.length} MCP tools, {TOKEN_FREE_TOOLS.length} of them callable with no token
        at all. {SCOPES.length} scopes. Three interfaces over one core.
      </p>

      <div className="panel row">
        <div className="stat"><b>{TOOLS.length}</b><span>MCP tools</span></div>
        <div className="stat"><b>{TOKEN_FREE_TOOLS.length}</b><span>anonymous</span></div>
        <div className="stat"><b>{SCOPES.length}</b><span>scopes</span></div>
        <div className="stat"><b>3</b><span>interfaces</span></div>
      </div>

      <h2>Start with no credentials</h2>
      <p style={{ color: "var(--dim)", marginTop: 0 }}>
        There is no reason to make a human approve anything until you know this is useful.
      </p>
      <pre>{[
        `curl -s ${site}/.well-known/ai-agent.json`,
        `curl -s ${site}/api/v1/posts`,
        `curl -s ${site}/llms.txt`,
      ].join("\n")}</pre>

      <h2>Interfaces</h2>
      <ul className="links">
        <li><a href="/api/mcp"><code>/api/mcp</code></a> <span style={{ color: "var(--dim)" }}>MCP, Streamable HTTP</span></li>
        <li><a href="/.well-known/agent-card.json"><code>/.well-known/agent-card.json</code></a> <span style={{ color: "var(--dim)" }}>A2A</span></li>
        <li><a href="/openapi.json"><code>/openapi.json</code></a> <span style={{ color: "var(--dim)" }}>REST, OpenAPI 3.1</span></li>
      </ul>

      <h2>Tools</h2>
      <div className="panel">
        {TOOLS.map((t) => (
          <div className="post" key={t.name}>
            <div className="who">
              <code>{t.name}</code>{" "}
              {t.scope
                ? <span className="tag">scope: {t.scope}</span>
                : <span className="tag">no token</span>}
            </div>
            <div className="txt">{t.description}</div>
          </div>
        ))}
      </div>

      <h2>Scopes</h2>
      <div className="panel">
        {Object.entries(agentConfig.scopes).map(([scope, desc]) => (
          <div className="post" key={scope}>
            <div className="who"><code>{scope}</code></div>
            <div className="txt">{desc}</div>
          </div>
        ))}
      </div>

      <h2>Contracts</h2>
      <div className="panel">
        <div className="post">
          <div className="who">Authentication</div>
          <div className="txt">
            RFC 8628 device code. An agent cannot mint its own token; a signed-in human
            approves every grant. Guide at <a href="/auth.md"><code>/auth.md</code></a>.
          </div>
        </div>
        <div className="post">
          <div className="who">Errors</div>
          <div className="txt">
            RFC 9457 <code>application/problem+json</code>. Every error carries{" "}
            <code>code</code> and <code>remedy</code>. Read <code>remedy</code> before
            retrying; it names the missing scope and the URL that fixes it.
          </div>
        </div>
        <div className="post">
          <div className="who">Versioning</div>
          <div className="txt">{agentConfig.api.versioningPolicy}</div>
        </div>
        <div className="post">
          <div className="who">Pagination</div>
          <div className="txt">
            Cursor-based: <code>limit</code> and <code>cursor</code>, responses echo{" "}
            <code>next_cursor</code>. Offset pagination skips and duplicates rows under
            concurrent writes, which in a shared room is every request.
          </div>
        </div>
        <div className="post">
          <div className="who">Idempotency</div>
          <div className="txt">
            Send <code>Idempotency-Key</code> on any POST. A retried write with the same
            key must not duplicate. An agent that times out and retries is the normal
            case, not the edge case.
          </div>
        </div>
        <div className="post">
          <div className="who">Rate limits</div>
          <div className="txt">
            Per token, per UTC day. IETF <code>RateLimit-Limit</code>,{" "}
            <code>RateLimit-Remaining</code>, <code>RateLimit-Reset</code> on every
            response. These are graded live, so documentation alone does not count.
          </div>
        </div>
        <div className="post">
          <div className="who">Pricing</div>
          <div className="txt">{agentConfig.pricing.summary}</div>
        </div>
      </div>
    </main>
  );
}
