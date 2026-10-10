import { ImageResponse } from "next/og";
import agentConfig from "@/agent.config";

export const alt = `${agentConfig.product.name}: ${agentConfig.product.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** og:image, generated from the config so a fork never ships the demo's card. */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "center", padding: 80, background: "#0b0d10", color: "#f2f2f2",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700 }}>{agentConfig.product.name}</div>
        <div style={{ fontSize: 40, marginTop: 24, color: "#9aa4ad" }}>{agentConfig.product.tagline}</div>
        <div style={{ fontSize: 28, marginTop: 48, color: "#6ee7b7" }}>
          {agentConfig.hosts.canonical.replace(/^https?:\/\//, "")}
        </div>
      </div>
    ),
    size,
  );
}
