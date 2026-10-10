/**
 * ONE error contract, used by MCP, A2A and REST alike.
 *
 * RFC 9457 `application/problem+json`. A typed `type` URI, a stable `code`, a
 * human `title`, and — the field almost everyone omits and agents need most —
 * `remedy`: what the caller should actually DO about it.
 *
 * An agent that gets `{"error":"forbidden"}` retries the same call forever. An
 * agent that gets a remedy string naming the scope it is missing and the URL to
 * mint a token with it recovers without a human.
 */
import agentConfig from "@/agent.config";

export type ErrorCode =
  | "parse_error" | "invalid_request" | "not_found"
  | "no_token" | "token_invalid" | "token_expired"
  | "scope_required" | "rate_limited" | "internal";

const STATUS: Record<ErrorCode, number> = {
  parse_error: 400, invalid_request: 400, not_found: 404,
  no_token: 401, token_invalid: 401, token_expired: 401,
  scope_required: 403, rate_limited: 429, internal: 500,
};

export function problem(
  code: ErrorCode,
  title: string,
  remedy: string,
  extra: Record<string, unknown> = {},
) {
  const status = STATUS[code];
  return Response.json(
    {
      // A stable identifier, per RFC 9457. Config-driven so a fork does not
      // advertise this repo's domain as the authority for its own errors.
      type: `${agentConfig.hosts.canonical}/errors/${code}`,
      title,
      status,
      code,
      remedy,
      ...extra,
    },
    {
      status,
      headers: {
        "content-type": "application/problem+json",
        "access-control-allow-origin": "*",
      },
    },
  );
}
