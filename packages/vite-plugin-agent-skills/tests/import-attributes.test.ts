import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build, createServer, type Rollup, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { agentSkills } from "../src/index";

const fixtureRoots: string[] = [];
const devServers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.all(devServers.splice(0).map((server) => server.close()));
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("import attributes", () => {
  it("imports markdown as a string", async () => {
    const root = await createFixtureRoot();
    await writeFile(join(root, "note.md"), "# Hello\n");
    await writeFile(
      join(root, "entry.ts"),
      `import note from "./note.md" with { type: "markdown" };
export const value = note;`,
    );

    const mod = await buildAndImport<{ value: string }>(root);

    expect(mod.value).toBe("# Hello\n");
  });

  it("rejects markdown attributes on non-markdown files", async () => {
    const root = await createFixtureRoot();
    await writeFile(join(root, "note.txt"), "Hello");
    await writeFile(
      join(root, "entry.ts"),
      `import note from "./note.txt" with { type: "markdown" };
export const value = note;`,
    );

    await expect(buildFixture(root)).rejects.toThrow(/Markdown imports must target a \.md file/);
  });

  it("rejects dynamic SKILL.md imports", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `export async function loadSkill() {
  return import("./skills/review/SKILL.md");
}`,
    );

    await expect(buildFixture(root)).rejects.toThrow(/Dynamic SKILL\.md import/);
  });

  it("does not reject dynamic SKILL.md imports when skill imports are disabled", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `export async function loadSkill() {
  return import("./skills/review/SKILL.md");
}`,
    );

    await expect(buildFixture(root, { skill: false })).resolves.toEqual(expect.any(Array));
  });

  it("requires SKILL.md imports to use the skill attribute", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md";
export const value = skill;`,
    );

    await expect(buildFixture(root)).rejects.toThrow(/must use an import attribute/);
  });

  it("imports SKILL.md as a single skill object", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await mkdir(join(root, "skills", "review", "references"), { recursive: true });
    await writeFile(join(root, "skills", "review", "references", "guide.md"), "Check behavior.");
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md" with { type: "skill" };
export const value = skill;`,
    );

    const mod = await buildAndImport<{
      value: { id: string; name: string; description: string; resources: unknown[] };
    }>(root);

    expect(mod.value).toMatchObject({
      id: expect.stringMatching(/^skill:review:/),
      name: "review",
      description: "Review source changes.",
      resources: [
        {
          path: "references/guide.md",
          kind: "reference",
          encoding: "text",
          content: "Check behavior.",
        },
      ],
    });
  });

  it("serves SKILL.md virtual modules in dev", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md" with { type: "skill" };
export const value = skill;`,
    );

    const baseUrl = await startFixtureServer(root);
    const indexResponse = await fetch(new URL("/", baseUrl));
    expect(indexResponse.ok).toBe(true);

    const skillUrl = await virtualModuleUrl(baseUrl, "skill");
    const skillResponse = await fetch(new URL(skillUrl, baseUrl));
    expect(skillResponse.ok).toBe(true);
    await expect(skillResponse.text()).resolves.toContain("skill:review:");
  });

  it("serves markdown virtual modules in dev", async () => {
    const root = await createFixtureRoot();
    await writeFile(join(root, "note.md"), "# Hello\n");
    await writeFile(
      join(root, "entry.ts"),
      `import note from "./note.md" with { type: "markdown" };
export const value = note;`,
    );

    const baseUrl = await startFixtureServer(root);
    const markdownUrl = await virtualModuleUrl(baseUrl, "markdown");
    const markdownResponse = await fetch(new URL(markdownUrl, baseUrl));
    expect(markdownResponse.ok).toBe(true);
    await expect(markdownResponse.text()).resolves.toContain(JSON.stringify("# Hello\n"));
  });

  it("reflects SKILL.md edits in dev after invalidation", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md" with { type: "skill" };
export const value = skill;`,
    );

    const baseUrl = await startFixtureServer(root);
    const skillUrl = await virtualModuleUrl(baseUrl, "skill");
    await expect(fetch(new URL(skillUrl, baseUrl)).then((r) => r.text())).resolves.toContain(
      "Review source changes.",
    );

    await writeFile(
      join(root, "skills", "review", "SKILL.md"),
      `---
name: review
description: Review updated changes.
---

Read the diff and report correctness issues.
`,
    );

    const updated = await waitFor(async () => {
      const text = await fetch(new URL(skillUrl, baseUrl)).then((r) => r.text());
      if (text.includes("Review updated changes.")) return text;
      return undefined;
    });
    expect(updated).toContain("Review updated changes.");
  });

  it("packages resources added to a skill directory while the dev server runs", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md" with { type: "skill" };
export const value = skill;`,
    );

    const baseUrl = await startFixtureServer(root);
    const skillUrl = await virtualModuleUrl(baseUrl, "skill");
    await expect(fetch(new URL(skillUrl, baseUrl)).then((r) => r.text())).resolves.not.toContain(
      "references/extra.md",
    );

    await mkdir(join(root, "skills", "review", "references"), { recursive: true });
    await writeFile(join(root, "skills", "review", "references", "extra.md"), "Extra guidance.");

    const updated = await waitFor(async () => {
      const text = await fetch(new URL(skillUrl, baseUrl)).then((r) => r.text());
      if (text.includes("references/extra.md")) return text;
      return undefined;
    });
    expect(updated).toContain("Extra guidance.");
  }, 10_000);

  it("imports SKILL.md as raw markdown when rejectSkillMarkdown is disabled", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `import doc from "./skills/review/SKILL.md" with { type: "markdown" };
export const value = doc;`,
    );

    const mod = await buildAndImport<{ value: string }>(root, {
      markdown: { rejectSkillMarkdown: false },
    });

    expect(mod.value).toContain("name: review");
  });

  it("does not emit a transform import by default", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md" with { type: "skill" };
export const value = skill;`,
    );

    const output = await buildFixture(root);
    const chunk = output.find((item): item is Rollup.OutputChunk => item.type === "chunk");

    expect(chunk?.code).toContain('id: "skill:review:');
    expect(chunk?.code).not.toContain("transformSkill");
  });

  it("builds with warnings instead of failing in warn-mode validation", async () => {
    const root = await createFixtureRoot();
    const skillDirectory = join(root, "skills", "review");
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      `---
name: summarize
description: Summarize source changes.
---

Body
`,
    );
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md" with { type: "skill" };
export const value = skill;`,
    );

    const mod = await buildAndImport<{ value: { name: string } }>(root, {
      skill: { validate: "warn" },
    });

    expect(mod.value.name).toBe("summarize");
  });

  it("wraps skill modules through the configured transform", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "skill-transform.ts"),
      `export function toPromptSkill(skill) {
  return { id: skill.id, prompt: skill.body, skill };
}`,
    );
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md" with { type: "skill" };
export const value = skill;`,
    );

    const mod = await buildAndImport<{
      value: { id: string; prompt: string; skill: { name: string } };
    }>(root, {
      skill: { transform: { importFrom: "/skill-transform.ts", importName: "toPromptSkill" } },
    });

    expect(mod.value.id).toMatch(/^skill:review:/);
    expect(mod.value.prompt).toBe("Read the diff and report correctness issues.");
    expect(mod.value.skill.name).toBe("review");
  });

  it("rejects invalid transform import identifiers", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md" with { type: "skill" };
export const value = skill;`,
    );

    await expect(
      buildFixture(root, {
        skill: { transform: { importFrom: "/skill-transform.ts", importName: "transform-skill" } },
      }),
    ).rejects.toThrow(
      /skill\.transform\.importName "transform-skill" is not a valid JavaScript identifier/,
    );
  });
});

async function createFixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agent-skills-import-"));
  fixtureRoots.push(root);
  return root;
}

async function writeSkill(root: string): Promise<void> {
  const skillDirectory = join(root, "skills", "review");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(
    join(skillDirectory, "SKILL.md"),
    `---
name: review
description: Review source changes.
---

Read the diff and report correctness issues.
`,
  );
}

async function startFixtureServer(
  root: string,
  options: Parameters<typeof agentSkills>[0] = {},
): Promise<string> {
  await writeFile(
    join(root, "index.html"),
    `<!doctype html><script type="module" src="/entry.ts"></script>`,
  );
  const server = await createServer({
    root,
    logLevel: "silent",
    plugins: [agentSkills(options)],
    server: {
      host: "127.0.0.1",
      port: 0,
    },
  });
  devServers.push(server);
  await server.listen();

  const baseUrl = server.resolvedUrls?.local[0];
  if (baseUrl === undefined) throw new Error("Vite dev server did not expose a local URL.");

  // Load the HTML shell first so the module pipeline serves /entry.ts transformed.
  const indexResponse = await fetch(new URL("/", baseUrl));
  if (!indexResponse.ok) throw new Error("Dev server did not serve index.html.");
  return baseUrl;
}

async function virtualModuleUrl(baseUrl: string, kind: "markdown" | "skill"): Promise<string> {
  const entryResponse = await fetch(new URL("/entry.ts", baseUrl));
  if (!entryResponse.ok) throw new Error("Dev server did not serve /entry.ts.");
  const entryCode = await entryResponse.text();
  const pattern = new RegExp(`"(?<url>/@id/__x00__vite-plugin-agent-skills:${kind}:[^"]+)"`);
  const url = entryCode.match(pattern)?.groups?.url;
  if (url === undefined) {
    throw new Error(`Entry module does not reference a ${kind} virtual module: ${entryCode}`);
  }
  return url;
}

// Polls sequentially on purpose: each probe must observe the dev server after
// the previous one settled.
/* oxlint-disable no-await-in-loop */
async function waitFor<T>(probe: () => Promise<T | undefined>, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for dev server state.");
}
/* oxlint-enable no-await-in-loop */

async function buildAndImport<T>(
  root: string,
  options?: Parameters<typeof agentSkills>[0],
): Promise<T> {
  const output = await buildFixture(root, options);
  const chunk = output.find((item): item is Rollup.OutputChunk => item.type === "chunk");
  if (!chunk) throw new Error("Fixture build did not produce an output chunk.");

  return import(`data:text/javascript,${encodeURIComponent(chunk.code)}`) as Promise<T>;
}

async function buildFixture(
  root: string,
  options: Parameters<typeof agentSkills>[0] = {},
  external: Array<string | RegExp> = [],
): Promise<Rollup.OutputBundle> {
  const result = await build({
    root,
    logLevel: "silent",
    plugins: [
      agentSkills(options),
      {
        name: "test-external-skill-markdown",
        enforce: "pre",
        resolveId(source) {
          if (source.endsWith("/SKILL.md")) return join(root, source);
          return null;
        },
        load(id) {
          if (id.endsWith("/SKILL.md")) return "export default {};";
          return null;
        },
      },
    ],
    build: {
      write: false,
      lib: {
        entry: join(root, "entry.ts"),
        formats: ["es"],
        fileName: "entry",
      },
      rollupOptions: {
        external: [/^node:/, ...external],
      },
    },
  });

  if (Array.isArray(result)) return result[0]?.output ?? [];
  return result.output;
}
