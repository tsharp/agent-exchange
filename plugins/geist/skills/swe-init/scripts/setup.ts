import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parse, stringify } from "smol-toml";
import { resolveSkillRoutes } from "../../../src/hooks/skill-injection.ts";

const { values } = parseArgs({ options: {
  workspace: { type: "string" }, global: { type: "boolean" }, check: { type: "boolean" },
  "geist-dir": { type: "string" },
  skill: { type: "string", multiple: true },
} });
if (values.global && values.workspace) throw new Error("Choose --workspace or --global, not both.");

const plugin = realpathSync(values["geist-dir"] || fileURLToPath(new URL("../../../", import.meta.url)));
const identity = JSON.parse(readFileSync(join(plugin, "plugin.json"), "utf8"));
if (identity.name !== "geist" || !existsSync(join(plugin, "runtime/hooks/run.mjs"))) {
  throw new Error("A built Geist installation is required. Pass its directory with --geist-dir.");
}
const workspace = resolve(values.workspace || process.cwd());
const configPath = values.global
  ? join(resolve(process.env.GEIST_USER_DIR?.trim() || join(homedir(), ".geist")), "config.toml")
  : resolve(process.env.GEIST_CONFIG_FILE?.trim() || join(workspace, ".geist", "config.toml"));

// Refuse linked configuration paths rather than replacing a user's link target.
for (let cursor = configPath; dirname(cursor) !== cursor; cursor = dirname(cursor)) {
  try {
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Linked configuration path: ${cursor}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
const original = existsSync(configPath) ? readFileSync(configPath, "utf8") : undefined;
const config = original === undefined ? {} : parse(original);
const instructions = config.instructions;
if (instructions !== undefined && (!instructions || typeof instructions !== "object" || Array.isArray(instructions))) {
  throw new Error("Existing instructions must be a TOML table.");
}
const table = (instructions ?? {}) as Record<string, unknown>;
const existing = table.skills;
if (existing !== undefined && (!Array.isArray(existing) || existing.some((name) => typeof name !== "string" || !name.trim()))) {
  throw new Error("Existing instructions.skills must be an array of nonempty names.");
}
if (table.files !== undefined && (!Array.isArray(table.files) || !table.files.length || table.files.some((file) => typeof file !== "string" || !file.trim()))) {
  throw new Error("Existing instructions.files must be a nonempty array of paths.");
}
if (Array.isArray(table.files) && new Set(table.files).size !== table.files.length) {
  throw new Error("Existing instructions.files must not contain duplicates.");
}
const enabled = (existing ?? []) as string[];
const selected = values.skill ?? (values.check ? enabled : []);
if (!selected.length) throw new Error("Select at least one style with --skill <name>; --check alone validates existing routes.");
const combined = [...new Set([...enabled, ...selected])];
// Validate all routes against the same roots and metadata contract as startup,
// including personal skills. Reading does not initialize user data.
resolveSkillRoutes(workspace, combined, join(plugin, "skills"));
const configured = selected.every((name) => enabled.includes(name)) && new Set(enabled).size === enabled.length;
if (!values.check && !configured) {
  config.instructions = { ...table, skills: combined };
  const output = stringify(config);
  mkdirSync(dirname(configPath), { recursive: true });
  const backup = `${configPath}.swe-init-backup`;
  if (original !== undefined && !existsSync(backup)) writeFileSync(backup, original, { flag: "wx" });
  const temporary = `${configPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, output, { flag: "wx" });
    const current = existsSync(configPath) ? readFileSync(configPath, "utf8") : undefined;
    if (current !== original) throw new Error("Configuration changed during setup; retry after reviewing it.");
    renameSync(temporary, configPath);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
const ready = configured || !values.check;
console.log(JSON.stringify({
  configured: ready, configPath, scope: values.global ? "global" : "workspace",
  geistDirectory: plugin, skills: selected, hooksVerified: false,
  restartNeeded: !values.check && !configured,
}));
if (!ready) process.exitCode = 1;
