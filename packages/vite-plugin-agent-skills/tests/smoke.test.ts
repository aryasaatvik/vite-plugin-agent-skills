import { describe, expect, it } from "vitest";

import { agentSkills } from "../src/index";

describe("agentSkills", () => {
  it("creates a Vite plugin", () => {
    expect(agentSkills()).toMatchObject({
      name: "vite-plugin-agent-skills",
      enforce: "pre",
    });
  });
});
