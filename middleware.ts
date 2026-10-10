import { NextRequest, NextResponse } from "next/server";

/**
 * MARKDOWN CONTENT NEGOTIATION.
 *
 * An agent that sends `Accept: text/markdown` is telling you it wants the
 * content, not the chrome. Serving it 40KB of HTML with a nav bar and a hydration
 * payload is technically a valid response and practically a refusal: it burns
 * the agent's context on markup to deliver three paragraphs of substance.
 *
 * So when markdown is preferred over HTML, rewrite to the markdown twin of the
 * page. Humans and crawlers that send `Accept: text/html` are untouched.
 *
 * Note the ORDER CHECK rather than a substring match: browsers send long Accept
 * headers and a naive `includes("text/markdown")` would be fine, but a client
 * sending `text/html, text/markdown;q=0.1` prefers HTML and must get it.
 */
const MARKDOWN_TWINS: Record<string, string> = {
  "/": "/index.md",
};

function prefersMarkdown(accept: string): boolean {
  if (!accept) return false;
  const entries = accept.split(",").map((part) => {
    const [type, ...params] = part.trim().split(";");
    const q = params
      .map((p) => p.trim())
      .find((p) => p.startsWith("q="));
    return { type: type.trim().toLowerCase(), q: q ? Number(q.slice(2)) || 0 : 1 };
  });
  const md = entries.find((e) => e.type === "text/markdown");
  if (!md) return false;
  const html = entries.find((e) => e.type === "text/html");
  const star = entries.find((e) => e.type === "*/*" || e.type === "text/*");
  const competing = Math.max(html?.q ?? 0, star?.q ?? 0);
  return md.q >= competing;
}

export function middleware(req: NextRequest) {
  const twin = MARKDOWN_TWINS[req.nextUrl.pathname];
  if (twin && prefersMarkdown(req.headers.get("accept") || "")) {
    const url = req.nextUrl.clone();
    url.pathname = twin;
    const res = NextResponse.rewrite(url);
    // Tell caches this URL varies by Accept, or a CDN will serve the markdown
    // to the next browser that asks.
    res.headers.set("vary", "accept");
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
