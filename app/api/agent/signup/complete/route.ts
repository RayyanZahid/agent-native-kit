import { approveDeviceFlow } from "@/lib/device";
import { problem } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * THE HUMAN APPROVAL STEP. Called from /approve by a signed-in person.
 *
 * ============================= READ THIS =============================
 * This reference build trusts a posted `human_label`, because the kit ships
 * without an opinion about your identity provider. THAT IS NOT PRODUCTION SAFE
 * on its own: as written, anyone who knows a user_code can approve it.
 *
 * Wire your auth here before you ship anything real. With Clerk:
 *
 *   import { auth, currentUser } from "@clerk/nextjs/server"
 *   const { userId } = await auth()
 *   if (!userId) return problem("no_token", "Sign in first.", "...")
 *   const user = await currentUser()
 *
 * Then derive humanId and humanLabel from the SESSION, never from the body, and
 * pass that user's real tier so the scope ceiling is enforced against who they
 * actually are. The device-code flow's entire value is that a known human
 * approved a specific grant; a body-supplied identity throws that away.
 * =====================================================================
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as
    { user_code?: unknown; human_label?: unknown; decision?: unknown } | null;

  if (!body || typeof body.user_code !== "string") {
    return problem("invalid_request", "Missing user_code.", 'POST {"user_code":"ABCD-2345","human_label":"Your Name"}');
  }

  const label = typeof body.human_label === "string" && body.human_label.trim()
    ? body.human_label.trim().slice(0, 60)
    : "anonymous human";

  // TODO(you): replace this with your session identity. See the block above.
  const humanId = `h_${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}`;

  const out = await approveDeviceFlow(body.user_code, humanId, label, "member");
  if (!out.ok) {
    return problem("not_found", "That code is not pending approval.",
      "Codes expire after 15 minutes and can only be approved once. Ask the agent to start a new flow.");
  }

  return Response.json(
    { ok: true, approved_for: out.agentName, granted: out.granted,
      note: "The agent's next poll will receive its token. You can revoke it later." },
    { headers: { "cache-control": "no-store" } },
  );
}
