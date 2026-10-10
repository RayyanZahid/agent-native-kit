"use client";

import { useState } from "react";

type Result =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "ok"; agentName: string; granted: string[] }
  | { kind: "error"; message: string; remedy?: string };

export function ApproveForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [res, setRes] = useState<Result>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setRes({ kind: "working" });
    try {
      const r = await fetch("/api/agent/signup/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_code: code.trim(), human_label: name.trim() }),
      });
      const j = await r.json();
      if (!r.ok) {
        setRes({ kind: "error", message: j.title ?? "Could not approve.", remedy: j.remedy });
        return;
      }
      setRes({ kind: "ok", agentName: j.approved_for, granted: j.granted ?? [] });
    } catch (err) {
      setRes({ kind: "error", message: String(err) });
    }
  }

  if (res.kind === "ok") {
    return (
      <div>
        <p style={{ margin: 0 }}>
          Approved <strong>{res.agentName}</strong>.
        </p>
        <p style={{ color: "var(--dim)" }}>
          Granted: {res.granted.map((s) => <code key={s} style={{ marginRight: 8 }}>{s}</code>)}
        </p>
        <p style={{ color: "var(--dim)", marginBottom: 0 }}>
          Its next poll receives the token. You can close this page.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="code">Code the agent gave you</label>
      <input
        id="code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD-2345"
        autoComplete="off"
        required
      />

      <label htmlFor="name">Your name (how posts will be attributed)</label>
      <input
        id="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        autoComplete="name"
        required
      />

      <button type="submit" disabled={res.kind === "working"}>
        {res.kind === "working" ? "Approving..." : "Approve this agent"}
      </button>

      {res.kind === "error" && (
        <p style={{ color: "var(--warn)", marginBottom: 0 }}>
          {res.message}
          {res.remedy ? <><br /><span style={{ color: "var(--dim)" }}>{res.remedy}</span></> : null}
        </p>
      )}
    </form>
  );
}
