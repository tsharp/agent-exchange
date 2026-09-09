import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { parse } from "smol-toml";

import { appendInstructions, type HookStage } from "../pipeline.ts";

const CONTEXT_EVENTS = new Set(["SessionStart", "SubagentStart"]);

function configuredInstructionFiles(workspace: string): string[] {
  const configuredPath = process.env.GEIST_CONFIG_FILE?.trim();
  const configPath = configuredPath || join(workspace, ".geist", "config.toml");
  if (!configuredPath && !existsSync(configPath)) {
    return [];
  }

  const config = parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const instructions = config.instructions;
  if (instructions === undefined) return [];
  if (!instructions || typeof instructions !== "object" || Array.isArray(instructions)) {
    throw new Error(`${configPath}: missing [instructions] table`);
  }
  const files = (instructions as Record<string, unknown>).files;
  if (!Array.isArray(files) || files.length === 0 || files.some((file) => typeof file !== "string" || !file.trim())) {
    throw new Error(`${configPath}: instructions.files must be a non-empty array of paths`);
  }

  const configDirectory = realpathSync(dirname(configPath));
  const resolved = files.map((file) => {
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
  return resolved;
}

export const injectWorkspaceContext: HookStage = {
  name: "inject-workspace-context",
  run(request, response) {
    if (!CONTEXT_EVENTS.has(request.event)) return;

    for (const file of configuredInstructionFiles(request.workspace)) {
      appendInstructions(response, readFileSync(file, "utf8"));
    }
  },
};
