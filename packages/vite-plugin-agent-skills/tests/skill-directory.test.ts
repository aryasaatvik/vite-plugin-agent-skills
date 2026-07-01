import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { collectSkillDirectoryFiles } from "../src/skill-directory";

describe("collectSkillDirectoryFiles", () => {
  it("respects gitignore files from the Vite root through skill subdirectories", async () => {
    const root = await mkdtemp(join(tmpdir(), "skill-dir-"));
    const skillDirectory = join(root, "skills", "review");
    await writeFile(join(root, ".gitignore"), "dist/\n.env\n");
    await mkdir(join(skillDirectory, "references"), { recursive: true });
    await mkdir(join(skillDirectory, "dist"), { recursive: true });
    await writeFile(join(skillDirectory, ".gitignore"), "draft.md\n");
    await writeFile(join(skillDirectory, "SKILL.md"), "---\nname: review\n---\n");
    await writeFile(join(skillDirectory, "references", "guide.md"), "Guide");
    await writeFile(join(skillDirectory, "references", "draft.md"), "Draft");
    await writeFile(join(skillDirectory, "dist", "bundle.js"), "generated");
    await writeFile(join(skillDirectory, ".env"), "SECRET=value");

    await expect(
      collectSkillDirectoryFiles({ skillDirectory, viteRoot: root }),
    ).resolves.toMatchObject([{ path: "references/guide.md" }]);
  });

  it("rejects non-ignored secret files", async () => {
    const root = await mkdtemp(join(tmpdir(), "skill-secret-"));
    const skillDirectory = join(root, "skills", "review");
    await mkdir(join(skillDirectory, "references"), { recursive: true });
    await writeFile(join(skillDirectory, "SKILL.md"), "---\nname: review\n---\n");
    await writeFile(join(skillDirectory, "references", "private.pem"), "secret");

    await expect(collectSkillDirectoryFiles({ skillDirectory, viteRoot: root })).rejects.toThrow(
      /sensitive file "references\/private\.pem"/,
    );
  });

  it("rejects included symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "skill-link-"));
    const skillDirectory = join(root, "skills", "review");
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(join(skillDirectory, "SKILL.md"), "---\nname: review\n---\n");
    await writeFile(join(root, "outside.md"), "outside");
    await symlink(join(root, "outside.md"), join(skillDirectory, "outside.md"));

    await expect(collectSkillDirectoryFiles({ skillDirectory, viteRoot: root })).rejects.toThrow(
      /symbolic link "outside\.md"/,
    );
  });
});
