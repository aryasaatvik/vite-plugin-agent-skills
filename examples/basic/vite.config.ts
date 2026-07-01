import { defineConfig } from "vite";
import { agentSkills } from "vite-plugin-agent-skills";

export default defineConfig({
  plugins: [
    agentSkills({
      skill: {
        mode: "manifest",
      },
    }),
  ],
});
