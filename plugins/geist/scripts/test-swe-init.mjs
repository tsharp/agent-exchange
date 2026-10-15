import "./test-user-env.mjs";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parse } from "smol-toml";
import { validateSkills } from "./validate-skills.mjs";

const root = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "geist-swe-init-"));
test.after(() => {
  assert.ok(resolve(temporary).startsWith(`${resolve(tmpdir())}${sep}geist-swe-init-`));
  rmSync(temporary, { recursive: true, force: true });
});
const installed = join(temporary, "installed plugin with spaces");
mkdirSync(installed);
for (const path of ["skills", "runtime", "plugin.json"]) cpSync(join(root, path), join(installed, path), { recursive: true });
const styles = ["example-communication","example-engineering","example-rust"];
for (const name of styles) {
  const directory = join(installed, "skills", name);
  mkdirSync(join(directory, "agents"), { recursive: true });
  writeFileSync(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: Apply the synthetic ${name} fixture.\nmetadata:\n  version: 1.0.0\n  updated: 2026-10-14\n  status: stable\n---\n\n## Overview\nFixture body.\n\n## Completion checks\nCheck fixture behavior.\n`);
  writeFileSync(join(directory, "agents/openai.yaml"), 'interface:\n  display_name: "Example style"\n  short_description: "Synthetic style fixture for routing tests"\n');
}
const setup = join(installed, "skills/swe-init/scripts/setup.mjs");
const runner = join(installed, "runtime/hooks/run.mjs");
const environment = { ...process.env, GEIST_CONFIG_FILE: "", GEIST_HOOK_CONTROLLER: "", GEIST_WORKSPACE_DIR: "" };
function invoke(args, env = environment, select = true) {
  return spawnSync(process.execPath, [setup, ...args, ...(select ? styles.flatMap(name => ["--skill", name]) : [])], { env, encoding: "utf8", windowsHide: true });
}

test("copied init script preserves settings, backs up original bytes, and is idempotent", () => {
  const workspace = join(temporary, "project");
  const config = join(workspace, ".geist/config.toml");
  mkdirSync(join(workspace, ".geist"), { recursive: true });
  const original = '# Keep this original\n[instructions]\nfiles=["project.md"]\n[rag]\nenabled=true\ntop_k=4\n';
  writeFileSync(config, original);
  writeFileSync(join(workspace, ".geist/project.md"), "Local project instructions.");
  assert.equal(invoke(["--workspace", workspace, "--check"]).status, 1);
  assert.equal(readFileSync(config, "utf8"), original, "check must not modify config");
  const result = invoke(["--workspace", workspace]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hooksVerified, false);
  const configured = readFileSync(config, "utf8");
  assert.deepEqual(parse(configured).rag, { enabled: true, top_k: 4 });
  assert.deepEqual(parse(configured).instructions.files, ["project.md"]);
  assert.equal(readFileSync(`${config}.swe-init-backup`, "utf8"), original);
  assert.equal(invoke(["--workspace", workspace]).status, 0);
  assert.equal(readFileSync(config, "utf8"), configured);
  assert.equal(invoke(["--workspace", workspace, "--check"]).status, 0);

  // Exercise the standalone installed bundle, not just its TypeScript helpers.
  for (const host of ["codex", "copilot"]) {
    for (const event of ["SessionStart", "SubagentStart"]) {
      const response = spawnSync(process.execPath, [runner, host, event], {
        env: environment, input: JSON.stringify({ cwd: workspace }), encoding: "utf8", windowsHide: true,
      });
      assert.equal(response.status, 0, response.stderr);
      const output = JSON.parse(response.stdout);
      const context = host === "codex" ? output.hookSpecificOutput.additionalContext : output.additionalContext;
      for (const skill of ["example-communication", "example-engineering", "example-rust"]) {
        assert.ok(context.includes(join(installed, "skills", skill, "SKILL.md").replaceAll("\\", "\\\\")));
      }
      assert.ok(context.startsWith("Local project instructions."));
      assert.ok(context.length < 2500, "routing fits the shipped Codex hook context limit");
      assert.ok(!context.includes("Fixture body."), "full style bodies stay behind canonical pointers");
    }
  }
});

test("global and explicit workspace config scopes are independent and unrelated skills survive", () => {
  const user = join(temporary, "global user");
  const selected = join(temporary, "selected.toml");
  writeFileSync(selected, '[instructions]\nskills=["custom-style"]\n');
  const custom = join(temporary, ".agents/skills/custom-style");
  mkdirSync(custom, { recursive: true });
  writeFileSync(join(custom, "SKILL.md"), "---\nname: custom-style\ndescription: Retained custom style.\n---\n");
  const env = { ...environment, GEIST_USER_DIR: user, GEIST_CONFIG_FILE: selected };
  const check = invoke(["--global", "--check"], env);
  assert.equal(check.status, 1);
  assert.equal(existsSync(user), false, "read-only check must not initialize user data");
  assert.equal(invoke(["--global"], env).status, 0);
  assert.equal(JSON.parse(invoke(["--global", "--check"], env).stdout).configPath, join(user, "config.toml"));
  assert.equal(invoke(["--workspace", temporary], env).status, 0);
  assert.equal(parse(readFileSync(selected, "utf8")).instructions.skills[0], "custom-style");
});

test("invalid or linked configuration is preserved and missing dependency fails before writing", () => {
  const config = join(temporary, "bad.toml");
  for (const content of ['[broken', '[instructions]\nskills="wrong"\n']) {
    writeFileSync(config, content);
    const result = invoke([], { ...environment, GEIST_CONFIG_FILE: config });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(config, "utf8"), content);
  }
  const linkedDirectory = join(temporary, "linked-config");
  const actual = join(temporary, "actual-config");
  mkdirSync(actual);
  symlinkSync(actual, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
  const linked = invoke([], { ...environment, GEIST_CONFIG_FILE: join(linkedDirectory, "config.toml") });
  assert.notEqual(linked.status, 0);
  assert.equal(existsSync(join(actual, "config.toml")), false);
  const missing = invoke(["--geist-dir", temporary, "--workspace", temporary]);
  assert.notEqual(missing.status, 0);
});

test("startup routing rejects missing, duplicate, ambiguous, and malformed selected skills", () => {
  const workspace = join(temporary, "invalid-selection");
  mkdirSync(join(workspace, ".geist"), { recursive: true });
  const config = join(workspace, ".geist/config.toml");
  const run = () => spawnSync(process.execPath, [runner, "codex", "SessionStart"], {
    env: environment, input: JSON.stringify({ cwd: workspace }), encoding: "utf8", windowsHide: true,
  });
  for (const [skills, error] of [
    ['["missing-skill"]', /was not found/],
    ['["example-engineering", "example-engineering"]', /must not contain duplicates/],
    ['[]', /non-empty array/],
    ['"example-engineering"', /non-empty array/],
  ]) {
    writeFileSync(config, `[instructions]\nskills=${skills}\n`);
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
  }
  const shadow = join(workspace, ".agents/skills/example-engineering");
  mkdirSync(shadow, { recursive: true });
  writeFileSync(join(shadow, "SKILL.md"), "---\nname: example-engineering\ndescription: Shadow style\n---\n");
  writeFileSync(config, '[instructions]\nskills=["example-engineering"]\n');
  assert.match(run().stderr, /is ambiguous/);
  const malformed = join(workspace, ".agents/skills/bad-style");
  mkdirSync(malformed, { recursive: true });
  writeFileSync(join(malformed, "SKILL.md"), "---\nname: different-name\n---\n");
  writeFileSync(config, '[instructions]\nskills=["bad-style"]\n');
  assert.match(run().stderr, /matching name and nonempty description/);
});

test("style packages validate and broken references or nested discovery fail", async () => {
  const valid = await validateSkills(root);
  assert.deepEqual(valid, { failures: [], skillCount: 7 });
  writeFileSync(join(installed, "skills/example-engineering/SKILL.md"),
    readFileSync(join(installed, "skills/example-engineering/SKILL.md"), "utf8") + '\n[Missing](references/absent.md)\n[Outside](../outside.md)\n');
  mkdirSync(join(installed, "skills/category"));
  const invalid = await validateSkills(installed);
  assert.match(invalid.failures.join("\n"), /missing link/);
  assert.match(invalid.failures.join("\n"), /link escapes independent skill/);
  assert.match(invalid.failures.join("\n"), /immediate skill/);
});

test("personal skills route from the overridden user directory for both hosts and startup events", () => {
  const user = join(temporary, "private user data");
  const workspace = join(temporary, "personal consumer");
  const skill = join(user, "skills", "personal-style");
  mkdirSync(skill, { recursive: true });
  mkdirSync(workspace);
  writeFileSync(join(skill, "SKILL.md"), '---\nname: personal-style\ndescription: Apply private style when engineering.\n---\nPrivate style body.\n');
  writeFileSync(join(user, "config.toml"), '[instructions]\nskills=["personal-style"]\n');
  const env = { ...environment, GEIST_USER_DIR: user };
  for (const host of ["codex", "copilot"]) {
    for (const event of ["SessionStart", "SubagentStart"]) {
      const result = spawnSync(process.execPath, [runner, host, event], {
        env, input: JSON.stringify({ cwd: workspace }), encoding: "utf8", windowsHide: true,
      });
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      const context = host === "codex" ? output.hookSpecificOutput.additionalContext : output.additionalContext;
      assert.ok(context.includes(JSON.stringify(join(skill, "SKILL.md"))));
      assert.ok(context.includes("Apply private style when engineering."));
      assert.ok(!context.includes("Private style body."));
    }
  }
  const shadow = join(workspace, ".agents/skills/personal-style");
  mkdirSync(shadow, { recursive: true });
  writeFileSync(join(shadow, "SKILL.md"), '---\nname: personal-style\ndescription: Workspace copy.\n---\n');
  const ambiguous = spawnSync(process.execPath, [runner, "codex", "SessionStart"], {
    env, input: JSON.stringify({ cwd: workspace }), encoding: "utf8", windowsHide: true,
  });
  assert.notEqual(ambiguous.status, 0);
  assert.match(ambiguous.stderr, /is ambiguous/);
});

test("setup requires explicit selections and validates private routes before writing", () => {
  const user = join(temporary, "setup personal user");
  const workspace = join(temporary, "setup personal consumer");
  const config = join(user, "config.toml");
  mkdirSync(workspace);
  const env = { ...environment, GEIST_USER_DIR: user };
  const unselected = invoke(["--global"], env, false);
  assert.notEqual(unselected.status, 0);
  assert.match(unselected.stderr, /Select at least one style/);
  assert.equal(existsSync(user), false);
  const missing = invoke(["--global", "--skill", "absent-style"], env, false);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /was not found/);
  assert.equal(existsSync(user), false);
  const skill = join(user, "skills/private-example");
  mkdirSync(skill, { recursive: true });
  const original = '[rag]\nenabled=false\n';
  writeFileSync(config, original);
  writeFileSync(join(skill, "SKILL.md"), '---\nname: wrong-name\ndescription: Malformed style.\n---\n');
  const malformed = invoke(["--global", "--skill", "private-example"], env, false);
  assert.notEqual(malformed.status, 0);
  assert.equal(readFileSync(config, "utf8"), original);
  writeFileSync(join(skill, "SKILL.md"), '---\nname: private-example\ndescription: Synthetic private style.\n---\n');
  const result = invoke(["--global", "--skill", "private-example"], env, false);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(parse(readFileSync(config, "utf8")).instructions.skills, ["private-example"]);
  assert.equal(readFileSync(`${config}.swe-init-backup`, "utf8"), original);
  const checked = invoke(["--global", "--check"], env, false);
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(JSON.parse(checked.stdout).skills, ["private-example"]);
  writeFileSync(join(skill, "SKILL.md"), '---\nname: wrong-name\ndescription: Broken after setup.\n---\n');
  assert.notEqual(invoke(["--global", "--check"], env, false).status, 0);
});
