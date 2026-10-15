import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { userDataDirectory } from "../rag/config.ts";

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

export function resolveSkills(workspace: string, names: readonly string[], pluginSkills = PLUGIN_SKILLS): { name: string; path: string }[] {
  const roots = [
    join(workspace, ".agents", "skills"),
    join(workspace, ".github", "skills"),
    join(workspace, "skills"),
    join(userDataDirectory(), "skills"),
    pluginSkills,
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
    return { name, path: realpathSync(path) };
  });
}

export function resolveSkillInstructions(workspace: string, names: readonly string[]): string[] {
  return resolveSkills(workspace, names).map(({ name, path }) =>
    `[Activated skill: ${name}]\n${withoutFrontmatter(readFileSync(path, "utf8"))}`);
}

// Route to the canonical file rather than spending hook context on full skill bodies.
export function resolveSkillRoutes(workspace: string, names: readonly string[], pluginSkills = PLUGIN_SKILLS): string[] {
  return resolveSkills(workspace, names, pluginSkills).map(({ name, path }) => {
    const content = readFileSync(path, "utf8");
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
    const metadata = header ? parse(header[1]) : undefined;
    if (metadata?.name !== name || typeof metadata?.description !== "string" || !metadata.description.trim()) {
      throw new Error(`routed skill '${name}' needs matching name and nonempty description`);
    }
    return `[Required skill routing: ${name}]\nScope: ${metadata.description.trim()}\nWhen this scope applies, read and apply ${JSON.stringify(path)} before that work, including its task-relevant references. Explicit task and project instructions govern.`;
  });
}
