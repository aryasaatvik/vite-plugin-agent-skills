import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { collectSkillDirectoryFiles } from "../src/skill-directory";

async function createSkillFixture(
  prefix: string,
): Promise<{ root: string; skillDirectory: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const skillDirectory = join(root, "skills", "review");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(join(skillDirectory, "SKILL.md"), "---\nname: review\n---\n");
  return { root, skillDirectory };
}

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

  it("rejects sensitive directories", async () => {
    const { root, skillDirectory } = await createSkillFixture("skill-secret-dir-");
    await mkdir(join(skillDirectory, ".ssh"), { recursive: true });
    await writeFile(join(skillDirectory, ".ssh", "id_ed25519"), "key");

    await expect(collectSkillDirectoryFiles({ skillDirectory, viteRoot: root })).rejects.toThrow(
      /sensitive directory "\.ssh"/,
    );
  });

  it("includes gitignored files when gitignore matching is disabled", async () => {
    const { root, skillDirectory } = await createSkillFixture("skill-no-gitignore-");
    await writeFile(join(root, ".gitignore"), "notes.md\n");
    await writeFile(join(skillDirectory, "notes.md"), "Notes");

    await expect(
      collectSkillDirectoryFiles({
        skillDirectory,
        viteRoot: root,
        resources: { gitignore: false },
      }),
    ).resolves.toMatchObject([{ path: "notes.md" }]);
  });

  it("includes secret-looking files when rejectSecrets is disabled", async () => {
    const { root, skillDirectory } = await createSkillFixture("skill-allow-secrets-");
    await writeFile(join(skillDirectory, "private.pem"), "secret");

    await expect(
      collectSkillDirectoryFiles({
        skillDirectory,
        viteRoot: root,
        resources: { rejectSecrets: false },
      }),
    ).resolves.toMatchObject([{ path: "private.pem" }]);
  });

  it("skips symlinks silently when rejectSymlinks is disabled", async () => {
    const { root, skillDirectory } = await createSkillFixture("skill-allow-links-");
    await writeFile(join(root, "outside.md"), "outside");
    await symlink(join(root, "outside.md"), join(skillDirectory, "outside.md"));
    await writeFile(join(skillDirectory, "kept.md"), "kept");

    await expect(
      collectSkillDirectoryFiles({
        skillDirectory,
        viteRoot: root,
        resources: { rejectSymlinks: false },
      }),
    ).resolves.toMatchObject([{ path: "kept.md" }]);
  });

  it("warns on large files by default and still includes them", async () => {
    const { root, skillDirectory } = await createSkillFixture("skill-large-warn-");
    await writeFile(join(skillDirectory, "big.md"), "x".repeat(64));
    const warn = vi.fn();

    await expect(
      collectSkillDirectoryFiles({
        skillDirectory,
        viteRoot: root,
        resources: { largeFile: { bytes: 16 } },
        warn,
      }),
    ).resolves.toMatchObject([{ path: "big.md", size: 64 }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"big.md" is 64 bytes'));
  });

  it("fails the collection when largeFile.action is error", async () => {
    const { root, skillDirectory } = await createSkillFixture("skill-large-error-");
    await writeFile(join(skillDirectory, "big.md"), "x".repeat(64));

    await expect(
      collectSkillDirectoryFiles({
        skillDirectory,
        viteRoot: root,
        resources: { largeFile: { bytes: 16, action: "error" } },
      }),
    ).rejects.toThrow(/"big\.md" is 64 bytes/);
  });

  it("stays silent when largeFile.action is ignore", async () => {
    const { root, skillDirectory } = await createSkillFixture("skill-large-ignore-");
    await writeFile(join(skillDirectory, "big.md"), "x".repeat(64));
    const warn = vi.fn();

    await expect(
      collectSkillDirectoryFiles({
        skillDirectory,
        viteRoot: root,
        resources: { largeFile: { bytes: 16, action: "ignore" } },
        warn,
      }),
    ).resolves.toMatchObject([{ path: "big.md" }]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("skips ancestor gitignore scopes for skills outside the Vite root", async () => {
    const viteRoot = await mkdtemp(join(tmpdir(), "skill-outside-root-"));
    await writeFile(join(viteRoot, ".gitignore"), "notes.md\n");
    const { skillDirectory } = await createSkillFixture("skill-outside-skill-");
    await writeFile(join(skillDirectory, "notes.md"), "Notes");

    await expect(collectSkillDirectoryFiles({ skillDirectory, viteRoot })).resolves.toMatchObject([
      { path: "notes.md" },
    ]);
  });

  it("collects nested directories sorted by path", async () => {
    const { root, skillDirectory } = await createSkillFixture("skill-nested-");
    await mkdir(join(skillDirectory, "scripts"), { recursive: true });
    await mkdir(join(skillDirectory, "references"), { recursive: true });
    await writeFile(join(skillDirectory, "scripts", "run.sh"), "echo run");
    await writeFile(join(skillDirectory, "references", "guide.md"), "Guide");
    await writeFile(join(skillDirectory, "checklist.md"), "Checklist");

    await expect(
      collectSkillDirectoryFiles({ skillDirectory, viteRoot: root }),
    ).resolves.toMatchObject([
      { path: "checklist.md" },
      { path: "references/guide.md" },
      { path: "scripts/run.sh" },
    ]);
  });
});
