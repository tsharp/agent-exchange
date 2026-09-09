import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Codex 0.153.4 skips hooks for portable plugins. Register equivalent user hooks
// until the host supports them; never modify hook trust or unrelated handlers.
const [action = "install", directory = process.env.CODEX_HOME || resolve(homedir(), ".codex")] = process.argv.slice(2);
if (!["install", "remove"].includes(action)) throw new Error("Usage: setup-codex-hooks.mjs <install|remove> [codex-home]");
const plugin = fileURLToPath(new URL("../", import.meta.url));
const path = resolve(directory, "hooks.json");
if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Refusing to replace a linked hooks.json.");
const original = existsSync(path) ? readFileSync(path, "utf8") : undefined;
const config = original ? JSON.parse(original) : { hooks: {} };
const marker = "Geist (Agent Exchange) compatibility: ";
for (const [event, groups] of Object.entries(config.hooks ?? {})) {
  config.hooks[event] = groups.flatMap((group) => {
    const remaining = group.hooks.filter((hook) => !hook.statusMessage?.startsWith(marker));
    return remaining.length === group.hooks.length ? [group] : remaining.length ? [{ ...group, hooks: remaining }] : [];
  });
  if (!config.hooks[event].length) delete config.hooks[event];
}
if (action === "install") {
  config.hooks ??= {};
  const bundled = JSON.parse(readFileSync(resolve(plugin, "hooks/hooks.json"), "utf8"));
  const runner = resolve(plugin, "runtime/hooks/run.mjs");
  // Literal shell quoting protects installation paths containing spaces or metacharacters.
  const sh = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const ps = (value) => `'${value.replaceAll("'", "''")}'`;
  for (const [event, groups] of Object.entries(bundled.hooks)) {
    (config.hooks[event] ??= []).push(...groups.map((group) => ({ ...group, hooks: group.hooks.map((hook) => ({
      ...hook, statusMessage: marker + event,
      command: `${sh(process.execPath)} ${sh(runner)} codex ${event}`,
      commandWindows: `& ${ps(process.execPath)} ${ps(runner)} codex ${event}`,
    })) })));
  }
}
const output = `${JSON.stringify(config, null, 2)}\n`;
if (output !== original && (original !== undefined || action === "install")) {
  mkdirSync(resolve(directory), { recursive: true });
  if (original !== undefined && !existsSync(`${path}.geist-backup`)) writeFileSync(`${path}.geist-backup`, original, { flag: "wx" });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, output, { flag: "wx" });
  renameSync(temporary, path);
}
console.log(action === "install" ? `Registered six Geist user hooks in ${path}. Restart Codex and review them in /hooks.` : `Removed Geist compatibility registrations from ${path}.`);
