import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildAgentSkill, skillModuleCode, type AgentSkill } from "../src/agent-skill";
import { skillImportConfig } from "../src/skill-import";

const config = skillImportConfig(true);
if (config === undefined) throw new Error("skill imports should be enabled by default");

async function createSkillFixture(prefix: string): Promise<{ root: string; skillPath: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const skillDirectory = join(root, "skills", "review");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(
    join(skillDirectory, "SKILL.md"),
    "---\nname: review\ndescription: Review source changes.\n---\n\nBody\n",
  );
  return { root, skillPath: join(skillDirectory, "SKILL.md") };
}

describe("buildAgentSkill", () => {
  it("classifies resources by directory and encodes binary content as base64", async () => {
    const { root, skillPath } = await createSkillFixture("manifest-resources-");
    const skillDirectory = join(root, "skills", "review");
    await mkdir(join(skillDirectory, "references"), { recursive: true });
    await mkdir(join(skillDirectory, "scripts"), { recursive: true });
    await mkdir(join(skillDirectory, "assets"), { recursive: true });
    await writeFile(join(skillDirectory, "references", "guide.md"), "Guide");
    await writeFile(join(skillDirectory, "scripts", "run.sh"), "echo run");
    await writeFile(
      join(skillDirectory, "assets", "logo.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    await writeFile(join(skillDirectory, "checklist.md"), "Checklist");

    const skill = await buildAgentSkill({ skillPath, viteRoot: root, config });

    expect(skill.resources).toEqual([
      {
        path: "assets/logo.png",
        kind: "asset",
        size: 4,
        encoding: "base64",
        mimeType: "image/png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
      },
      {
        path: "checklist.md",
        kind: "file",
        size: 9,
        encoding: "text",
        mimeType: "text/markdown",
        content: "Checklist",
      },
      {
        path: "references/guide.md",
        kind: "reference",
        size: 5,
        encoding: "text",
        mimeType: "text/markdown",
        content: "Guide",
      },
      {
        path: "scripts/run.sh",
        kind: "script",
        size: 8,
        encoding: "text",
        mimeType: undefined,
        content: "echo run",
      },
    ]);
  });

  it("packages extension-less resources as base64 files without a mime type", async () => {
    const { root, skillPath } = await createSkillFixture("manifest-no-extension-");
    await writeFile(join(root, "skills", "review", "LICENSE"), "MIT");

    const skill = await buildAgentSkill({ skillPath, viteRoot: root, config });

    expect(skill.resources).toEqual([
      {
        path: "LICENSE",
        kind: "file",
        size: 3,
        encoding: "base64",
        mimeType: undefined,
        content: Buffer.from("MIT").toString("base64"),
      },
    ]);
  });

  it("produces deterministic fingerprints and ids for identical content", async () => {
    const first = await createSkillFixture("manifest-fingerprint-a-");
    const second = await createSkillFixture("manifest-fingerprint-b-");

    const firstManifest = await buildAgentSkill({
      skillPath: first.skillPath,
      viteRoot: first.root,
      config,
    });
    const secondManifest = await buildAgentSkill({
      skillPath: second.skillPath,
      viteRoot: second.root,
      config,
    });

    expect(firstManifest.fingerprint).toBe(secondManifest.fingerprint);
    expect(firstManifest.id).toBe(`skill:review:${firstManifest.fingerprint.slice(0, 16)}`);
  });

  it("changes the fingerprint when skill content changes", async () => {
    const { root, skillPath } = await createSkillFixture("manifest-fingerprint-drift-");
    const before = await buildAgentSkill({ skillPath, viteRoot: root, config });

    await writeFile(
      skillPath,
      "---\nname: review\ndescription: Review source changes carefully.\n---\n\nBody\n",
    );
    const after = await buildAgentSkill({ skillPath, viteRoot: root, config });

    expect(after.fingerprint).not.toBe(before.fingerprint);
  });
});

describe("skillModuleCode", () => {
  const skill: AgentSkill = {
    id: "skill:review:0123456789abcdef",
    fingerprint: "0123456789abcdef",
    name: "review",
    description: "Review source changes.",
    body: "Body",
    resources: [],
  };

  it("emits a plain skill module by default", () => {
    const code = skillModuleCode(skill, config);

    expect(code).toContain(`const skill = ${JSON.stringify(skill)};`);
    expect(code).toContain("export default skill;");
    expect(code).not.toContain("transformSkill");
  });

  it("emits a transform-wrapped module when configured", () => {
    const code = skillModuleCode(skill, {
      ...config,
      transform: { importFrom: "./skill-transform", importName: "toPromptSkill" },
    });

    expect(code).toContain('import { toPromptSkill as transformSkill } from "./skill-transform";');
    expect(code).toContain(`const skill = ${JSON.stringify(skill)};`);
    expect(code).toContain("export default transformSkill(skill);");
  });

  it("defaults transform imports to transformSkill", () => {
    const code = skillModuleCode(skill, {
      ...config,
      transform: { importFrom: "./skill-transform", importName: "transformSkill" },
    });

    expect(code).toContain('import { transformSkill as transformSkill } from "./skill-transform";');
  });
});
