import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { parse } from "smol-toml";

import { appendInstructions, type HookStage } from "../pipeline.ts";
import { initializeUserData } from "../../rag/config.ts";
import { resolveSkillRoutes } from "../skill-injection.ts";

const CONTEXT_EVENTS = new Set(["SessionStart", "SubagentStart"]);

function configuredInstructions(configPath: string, workspace: string, required = false): string[] {
  if (!required && !existsSync(configPath)) {
    return [];
  }

  const config = parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const instructions = config.instructions;
  if (instructions === undefined) return [];
  if (!instructions || typeof instructions !== "object" || Array.isArray(instructions)) {
    throw new Error(`${configPath}: missing [instructions] table`);
  }
  const files = (instructions as Record<string, unknown>).files;
  const skills = (instructions as Record<string, unknown>).skills;
  if (files === undefined && skills === undefined) {
    throw new Error(`${configPath}: instructions needs files or skills`);
  }
  if (files !== undefined && (!Array.isArray(files) || files.length === 0 || files.some((file) => typeof file !== "string" || !file.trim()))) {
    throw new Error(`${configPath}: instructions.files must be a non-empty array of paths`);
  }
  if (skills !== undefined && (!Array.isArray(skills) || skills.length === 0 || skills.some((skill) => typeof skill !== "string" || !skill.trim()))) {
    throw new Error(`${configPath}: instructions.skills must be a non-empty array of names`);
  }
  if (Array.isArray(skills) && new Set(skills).size !== skills.length) {
    throw new Error(`${configPath}: instructions.skills must not contain duplicates`);
  }

  const configDirectory = realpathSync(dirname(configPath));
  const resolved = ((files ?? []) as string[]).map((file) => {
    const path = file as string;
    if (isAbsolute(path)) throw new Error(`${configPath}: instruction paths must be relative`);
    const candidate = realpathSync(resolve(configDirectory, path));
    const fromConfig = relative(configDirectory, candidate);
    if (fromConfig === ".." || fromConfig.startsWith(`..${sep}`) || isAbsolute(fromConfig)) {
      throw new Error(`${configPath}: instruction paths must stay within ${configDirectory}`);
    }
    return candidate;
  });
  if (new Set(resolved).size !== resolved.length) {
    throw new Error(`${configPath}: instructions.files must not contain duplicates`);
  }
  return [
    ...resolved.map((file) => readFileSync(file, "utf8")),
    ...resolveSkillRoutes(workspace, (skills ?? []) as string[]),
  ];
}

export const injectWorkspaceContext: HookStage = {
  name: "inject-workspace-context",
  run(request, response) {
    if (!CONTEXT_EVENTS.has(request.event)) return;

    const globalConfig = join(initializeUserData(), "config.toml");
    const selected = process.env.GEIST_CONFIG_FILE?.trim();
    const localConfig = selected || join(request.workspace, ".geist", "config.toml");
    const instructions = configuredInstructions(globalConfig, request.workspace);
    if (resolve(localConfig) !== resolve(globalConfig)) instructions.push(...configuredInstructions(localConfig, request.workspace, !!selected));
    for (const instruction of instructions) {
      appendInstructions(response, instruction);
    }
  },
};
