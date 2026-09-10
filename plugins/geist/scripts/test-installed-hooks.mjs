import "./test-user-env.mjs";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = resolve(tmpdir());
const directory = mkdtempSync(join(temporaryRoot, "geist-install-"));
const installed = join(directory, "installed plugin with spaces", "geist");
const workspace = join(directory, "consumer workspace");
mkdirSync(installed, { recursive: true });
mkdirSync(join(workspace, ".geist"), { recursive: true });
for (const component of ["runtime", "hooks", ".codex-plugin", ".github", "package.json"]) {
  cpSync(join(root, component), join(installed, component), { recursive: true });
}
writeFileSync(join(workspace, ".geist", "config.toml"), '[instructions]\nfiles = ["instructions.md"]\n');
writeFileSync(join(workspace, ".geist", "instructions.md"), "Installed workspace context.");

test.after(() => {
  assert.ok(resolve(directory).startsWith(`${temporaryRoot}${sep}geist-install-`));
  rmSync(directory, { recursive: true, force: true });
});

const environment = { ...process.env, PLUGIN_ROOT: installed };
for (const key of Object.keys(environment)) {
  if (key.startsWith("GEIST_")) delete environment[key];
}

for (const host of ["codex", "copilot"]) {
  const config = JSON.parse(readFileSync(join(installed, "hooks",
    host === "codex" ? "hooks.json" : "copilot-hooks.json"), "utf8"));
  for (const [event, entries] of Object.entries(config.hooks)) {
    test(`installed ${host} ${event} command runs without npm dependencies`, () => {
      assert.equal(existsSync(join(installed, "node_modules")), false);
      const handler = host === "codex" ? entries[0].hooks[0] : entries[0];
      const windows = process.platform === "win32";
      const command = host === "codex"
        ? (windows ? handler.commandWindows : handler.command)
        : (windows ? handler.powershell : handler.bash);
      const result = spawnSync(windows ? "pwsh" : "bash",
        windows ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-c", command], {
          cwd: workspace,
          env: environment,
          input: JSON.stringify({ cwd: workspace }),
          encoding: "utf8",
          timeout: 5_000,
          windowsHide: true,
        });
      assert.equal(result.status, 0, result.stderr || String(result.error));
      const starts = ["SessionStart", "SubagentStart", "sessionStart", "subagentStart"].includes(event);
      const expected = !starts ? {} : host === "codex"
        ? { hookSpecificOutput: { hookEventName: event, additionalContext: "Installed workspace context." } }
        : { additionalContext: "Installed workspace context." };
      assert.deepEqual(JSON.parse(result.stdout), expected);
    });
  }
}

test("installed controller resolves skills relative to the installed plugin", () => {
  const skill = join(installed, "skills", "engineering", "hook-test-skill");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "---\nname: hook-test-skill\n---\nInstalled skill instructions.\n");
  const result = spawnSync(process.execPath, [join(installed, "runtime", "hooks", "run.mjs"), "codex", "SessionStart"], {
    cwd: workspace,
    env: {
      ...environment,
      GEIST_HOOK_CONTROLLER: JSON.stringify({
        command: process.execPath,
        args: [join(root, "scripts", "fixtures", "hook-controller.mjs")],
        events: ["SessionStart"],
        required: true,
      }),
    },
    input: JSON.stringify({ cwd: workspace }),
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext,
    /\[Activated skill: hook-test-skill\]\nInstalled skill instructions\./);
});
