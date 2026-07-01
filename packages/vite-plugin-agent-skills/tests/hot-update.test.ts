import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { agentSkills } from "../src/index";
import { skillModulePrefix } from "../src/virtual-modules";

interface FakeEnvironment {
  moduleGraph: {
    getModuleById: (id: string) => { id: string } | undefined;
    invalidateModule: ReturnType<typeof vi.fn>;
  };
}

function createEnvironment(moduleId: string): FakeEnvironment {
  return {
    moduleGraph: {
      getModuleById: (id) => (id === moduleId ? { id } : undefined),
      invalidateModule: vi.fn(),
    },
  };
}

describe("hotUpdate", () => {
  it("invalidates the skill module in every environment on a resource change", async () => {
    const root = await mkdtemp(join(tmpdir(), "hot-update-"));
    const skillDirectory = join(root, "skills", "review");
    await mkdir(join(skillDirectory, "references"), { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: review\ndescription: Review source changes.\n---\nBody\n",
    );
    await writeFile(join(skillDirectory, "references", "guide.md"), "Guide");

    const plugin = agentSkills({ skill: { mode: "manifest" } });
    (plugin.configResolved as (config: { root: string }) => void)({ root });

    const moduleId = `${skillModulePrefix}${join(skillDirectory, "SKILL.md")}`;
    const { handler: load } = plugin.load as {
      handler: (
        this: { addWatchFile: (id: string) => void; warn: (message: string) => void },
        id: string,
      ) => Promise<string | null>;
    };
    await load.call({ addWatchFile: () => {}, warn: () => {} }, moduleId);

    const hotUpdate = plugin.hotUpdate as (
      this: { environment: FakeEnvironment },
      update: { file: string },
    ) => Array<{ id: string }> | undefined;
    const update = { file: join(skillDirectory, "references", "guide.md") };

    const clientEnvironment = createEnvironment(moduleId);
    const clientModules = hotUpdate.call({ environment: clientEnvironment }, update);
    expect(clientEnvironment.moduleGraph.invalidateModule).toHaveBeenCalledOnce();
    expect(clientModules).toEqual([{ id: moduleId }]);

    // A second environment (e.g. SSR) runs the same hook for the same file event
    // and must still see the tracked skill module.
    const ssrEnvironment = createEnvironment(moduleId);
    const ssrModules = hotUpdate.call({ environment: ssrEnvironment }, update);
    expect(ssrEnvironment.moduleGraph.invalidateModule).toHaveBeenCalledOnce();
    expect(ssrModules).toEqual([{ id: moduleId }]);
  });

  it("ignores changes outside tracked skill directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "hot-update-miss-"));
    const plugin = agentSkills({ skill: { mode: "manifest" } });
    (plugin.configResolved as (config: { root: string }) => void)({ root });

    const hotUpdate = plugin.hotUpdate as (
      this: { environment: FakeEnvironment },
      update: { file: string },
    ) => Array<{ id: string }> | undefined;

    const environment = createEnvironment("unused");
    const modules = hotUpdate.call({ environment }, { file: join(root, "unrelated.ts") });

    expect(modules).toBeUndefined();
    expect(environment.moduleGraph.invalidateModule).not.toHaveBeenCalled();
  });
});
