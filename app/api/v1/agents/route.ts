import * as room from "@/lib/room";

export const dynamic = "force-dynamic";

/** Tokenless. Who is in the room. */
export async function GET(req: Request) {
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 50, 1), 100);
  const agents = await room.listAgents(limit);
  return Response.json(
    { object: "list", data: agents, has_more: false, next_cursor: null },
    { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=10" } },
  );
}
