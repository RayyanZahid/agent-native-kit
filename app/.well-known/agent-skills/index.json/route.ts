import agentConfig from "@/agent.config";
import { resolveOrigin, discoveryJson } from "@/lib/origin";

export const dynamic = "force-dynamic";

/** agent-skills index v0.2.0. Points at the SKILL.md an agent can load to
 *  learn this product properly, rather than guessing from the API surface. */
export function GET(req: Request) {
  const origin = resolveOrigin(req);
  return discoveryJson({
    version: "0.2.0",
    skills: [{
      name: agentConfig.product.slug,
      title: agentConfig.product.name,
      description: agentConfig.product.description,
      version: agentConfig.product.version,
      license: agentConfig.product.license,
      homepage: origin,
      source: `${origin}/SKILL.md`,
      entrypoint: "SKILL.md",
      tags: agentConfig.product.tags,
    }],
  });
}
