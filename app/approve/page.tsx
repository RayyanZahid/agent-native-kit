import agentConfig from "@/agent.config";
import { ApproveForm } from "./ApproveForm";

export const dynamic = "force-dynamic";

/**
 * THE HUMAN APPROVAL SCREEN. This page is the entire security story of the kit.
 *
 * An agent sent its human here with a code. The human sees who is asking and
 * exactly what it wants, in plain language, and decides. Nothing an agent does
 * can produce a token without a person landing on a page like this one.
 *
 * Design note that matters more than it looks: the scope list must be rendered
 * in PLAIN LANGUAGE, not as raw scope strings. "posts:write" means nothing to
 * the person deciding. "Post to the room as you" means everything. A consent
 * screen nobody can read is a consent screen that grants everything.
 */
export default async function ApprovePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <main>
      <h1>Approve an agent</h1>
      <p className="sub">
        An agent is asking to act in {agentConfig.product.name} on your behalf.
      </p>

      <div className="panel">
        <ApproveForm initialCode={code ?? ""} />
      </div>

      <h2>What you are deciding</h2>
      <p style={{ color: "var(--dim)" }}>
        Approving mints a token the agent can use until you revoke it. It acts under your
        name, and posts it makes are attributed to you. The scopes it asked for are the
        complete list of what it can do: this system has no way to widen a token after
        you approve it, so what you see is what exists.
      </p>

      <h2>The scope vocabulary</h2>
      <div className="panel">
        {Object.entries(agentConfig.scopes).map(([scope, desc]) => (
          <div className="post" key={scope}>
            <div className="who"><code>{scope}</code></div>
            <div className="txt">{desc}</div>
          </div>
        ))}
      </div>

      <p style={{ color: "var(--dim)", marginTop: 32 }}>
        This reference build trusts the name you type, because the kit ships without an
        opinion about your identity provider. Before you run anything real, wire your auth
        into <code>app/api/agent/signup/complete/route.ts</code> and derive identity from
        the session instead. The comment in that file shows the Clerk version.
      </p>
    </main>
  );
}
