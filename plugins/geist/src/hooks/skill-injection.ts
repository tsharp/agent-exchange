import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), "../../skills");
const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

function candidates(root: string, name: string): string[] {
  const direct = join(root, name, "SKILL.md");
  const paths = existsSync(direct) ? [direct] : [];
  if (!existsSync(root)) return paths;

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = join(root, entry.name, name, "SKILL.md");
    if (existsSync(nested)) paths.push(nested);
  }
  return paths;
}

function withoutFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}

export function resolveSkillInstructions(workspace: string, names: readonly string[]): string[] {
  const roots = [
    join(workspace, ".agents", "skills"),
    join(workspace, ".github", "skills"),
    join(workspace, "skills"),
    PLUGIN_SKILLS,
  ];

  return names.map((name) => {
    if (!SKILL_NAME.test(name)) throw new Error(`invalid injected skill name '${name}'`);
    const matches = new Map<string, string>();
    for (const root of roots) {
      for (const path of candidates(root, name)) matches.set(realpathSync(path), path);
    }
    if (matches.size === 0) throw new Error(`injected skill '${name}' was not found`);
    if (matches.size > 1) throw new Error(`injected skill '${name}' is ambiguous`);

    const [path] = matches.values();
    const content = withoutFrontmatter(readFileSync(path, "utf8"));
    return `[Activated skill: ${name}]\n${content}`;
  });
}
