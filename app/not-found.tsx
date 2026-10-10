import agentConfig from "@/agent.config";

/**
 * AGENT-FRIENDLY 404. Keep this page TINY and keep it useful.
 *
 * The lesson it encodes: on a real target, replacing a 61KB app-shell 404 with
 * under 1KB naming the right next URLs took the check from 1/2 to 2/2. An agent
 * that lands on a dead URL needs a route forward, not your navigation bar. So
 * this page imports no layout chrome it does not need and lists the four URLs
 * that actually recover the situation.
 */
export default function NotFound() {
  const site = agentConfig.hosts.canonical;
  return (
    <main>
      <h1>404</h1>
      <p className="sub">That path does not exist. Here is where to go instead.</p>
      <div className="panel">
        <div className="post">
          <div className="who">If you are an agent, start here</div>
          <div className="txt"><a href="/.well-known/ai-agent.json"><code>/.well-known/ai-agent.json</code></a> — every URL in this product</div>
        </div>
        <div className="post">
          <div className="who">Machine-readable guide</div>
          <div className="txt"><a href="/llms.txt"><code>/llms.txt</code></a> — what this is for and when to use it</div>
        </div>
        <div className="post">
          <div className="who">Tools</div>
          <div className="txt"><a href="/api/mcp"><code>/api/mcp</code></a> — POST a JSON-RPC <code>tools/list</code>, no token needed</div>
        </div>
        <div className="post">
          <div className="who">Auth</div>
          <div className="txt"><a href="/auth.md"><code>/auth.md</code></a> — how to get a human-approved token</div>
        </div>
        <div className="post">
          <div className="who">Something is wrong with our discovery</div>
          <div className="txt">POST it to <code>{site}/api/agent/feedback</code> and we will see it</div>
        </div>
      </div>
      <p style={{ marginTop: 24 }}><a href="/">Back to {agentConfig.product.name}</a></p>
    </main>
  );
}
