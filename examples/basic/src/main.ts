import releasePrompt from "./prompts/release-note.md" with { type: "markdown" };
import releaseSkill from "./skills/release-writer/SKILL.md" with { type: "skill" };

const skill = releaseSkill.skills[0];
if (skill === undefined) {
  throw new Error("Expected the release writer skill manifest to include one skill.");
}

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) {
  throw new Error("Expected #app to exist.");
}

app.innerHTML = `
  <h1>${skill.name}</h1>
  <p>${skill.description}</p>
  <h2>Imported Markdown</h2>
  <pre>${escapeHtml(releasePrompt)}</pre>
  <h2>Skill Manifest</h2>
  <pre>${escapeHtml(JSON.stringify(releaseSkill, null, 2))}</pre>
`;

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
