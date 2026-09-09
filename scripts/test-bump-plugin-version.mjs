import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const manifests = ["plugin.json", ".codex-plugin/plugin.json", ".github/plugin/plugin.json", "package.json"];
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "plugin-version-"));
  t.after(() => {
    assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}plugin-version-`));
    rmSync(root, { recursive: true, force: true });
  });
  cpSync(new URL("../bump-plugin-version.ps1", import.meta.url), join(root, "bump-plugin-version.ps1"));
  const write = (file, data) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), `${JSON.stringify(data, null, 2)}\n`);
  };
  const read = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
  for (const file of manifests) write(`plugins/geist/${file}`, { name: "geist", version: "2.5.9", dependencies: { example: "2.5.9" } });
  write("plugins/another/plugin.json", { name: "another", version: "2.5.9" });
  write("plugins/geist/skills/example/package.json", { name: "fixture", version: "2.5.9" });
  for (const file of ["package-lock.json", "npm-shrinkwrap.json"]) {
    write(`plugins/geist/${file}`, { name: "geist", version: "2.5.9", lockfileVersion: 3, packages: {
      "": { name: "geist", version: "2.5.9" }, "node_modules/example": { version: "2.5.9" },
    } });
    write(file, { name: "marketplace", version: "1.0.0", lockfileVersion: 3, packages: {
      "": { version: "1.0.0" }, "plugins/geist": { version: "2.5.9" }, "plugins/another": { version: "2.5.9" },
      "node_modules/geist": { resolved: "plugins/geist", link: true },
    } });
  }
  const run = (...args) => spawnSync("pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", join(root, "bump-plugin-version.ps1"), ...args],
    { cwd: tmpdir(), encoding: "utf8", windowsHide: true, timeout: 15000 });
  return { root, read, write, run };
}

for (const [part, expected] of [["patch", "2.5.10"], ["minor", "2.6.0"], ["major", "3.0.0"]]) {
  test(`${part} updates only the named plugin's release metadata from another cwd`, (t) => {
    const { read, run } = fixture(t);
    const result = run("geist", part);
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.match(result.stdout, new RegExp(expected.replaceAll(".", "\\.")));
    for (const file of manifests) assert.deepEqual(read(`plugins/geist/${file}`), { name: "geist", version: expected, dependencies: { example: "2.5.9" } });
    for (const file of ["package-lock.json", "npm-shrinkwrap.json"]) {
      const local = read(`plugins/geist/${file}`);
      assert.equal(local.version, expected);
      assert.equal(local.packages[""].version, expected);
      assert.equal(local.packages["node_modules/example"].version, "2.5.9");
      const workspace = read(file);
      assert.equal(workspace.version, "1.0.0");
      assert.deepEqual(workspace.packages, {
        "": { version: "1.0.0" }, "plugins/geist": { version: expected }, "plugins/another": { version: "2.5.9" },
        "node_modules/geist": { resolved: "plugins/geist", link: true },
      });
    }
    assert.equal(read("plugins/another/plugin.json").version, "2.5.9");
    assert.equal(read("plugins/geist/skills/example/package.json").version, "2.5.9");
  });
}

test("WhatIf and rejected input leave release files byte-identical", (t) => {
  const { root, write, run } = fixture(t);
  const paths = [...manifests.map((file) => `plugins/geist/${file}`), "package-lock.json", "npm-shrinkwrap.json", "plugins/geist/package-lock.json", "plugins/geist/npm-shrinkwrap.json"];
  const snapshot = () => paths.map((file) => readFileSync(join(root, file), "utf8"));
  const before = snapshot();
  assert.equal(run("-PluginName", "geist", "-Bump", "minor", "-WhatIf").status, 0);
  assert.deepEqual(snapshot(), before);
  for (const args of [["missing", "patch"], ["../geist", "patch"], ["geist", "invalid"]]) {
    assert.notEqual(run(...args).status, 0);
    assert.deepEqual(snapshot(), before);
  }
  write("plugins/geist/package-lock.json", { name: "geist", version: "9.0.0" });
  const inconsistent = snapshot();
  const result = run("geist", "patch");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Version mismatch/);
  assert.deepEqual(snapshot(), inconsistent, "late validation failures must not partially update manifests");
});

test("plugins without npm packages can be bumped by name", (t) => {
  const { read, run } = fixture(t);
  assert.equal(run("another", "minor").status, 0);
  assert.equal(read("plugins/another/plugin.json").version, "2.6.0");
  assert.equal(read("plugins/geist/plugin.json").version, "2.5.9");
});
