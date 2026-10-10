import { pollDeviceFlow } from "@/lib/device";
import { resolveOrigin } from "@/lib/origin";
import { problem } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = resolveOrigin(req);
  const code = new URL(req.url).searchParams.get("device_code");
  if (!code) {
    return problem("invalid_request", "Missing device_code.",
      `GET ${origin}/api/agent/signup/poll?device_code=dev_... using the device_code from /start.`);
  }

  const out = await pollDeviceFlow(code);

  if (out.status === "pending") {
    return Response.json(
      { status: "pending", note: "Your human has not approved yet. Poll again in 3 seconds; do not poll faster." },
      { status: 202, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
  }
  if (out.status === "expired") {
    return problem("token_expired", "That device code expired or was already redeemed.",
      `Start a new flow: POST ${origin}/api/agent/signup/start`);
  }
  if (out.status === "denied") {
    return problem("no_token", "Your human declined this request.",
      "Ask them why, then start a new flow requesting fewer scopes.");
  }

  return Response.json(out, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
