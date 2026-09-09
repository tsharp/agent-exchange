import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const codex = readJson(".agents/plugins/marketplace.json");
const copilot = readJson(".github/plugin/marketplace.json");

function localPath(base, path) {
  assert.equal(typeof path, "string", "Expected a local path");
  assert.ok(!isAbsolute(path), `Path must be relative: ${path}`);
  const target = resolve(base, path);
  const fromBase = relative(base, target);
  assert.ok(fromBase !== ".." && !fromBase.startsWith(`..${sep}`) && !isAbsolute(fromBase),
    `Path must stay within its root: ${path}`);
  assert.ok(statSync(target).isDirectory(), `Missing directory: ${path}`);
  return target;
}

assert.match(codex.name, /^[A-Za-z0-9_-]+$/);
assert.equal(codex.name, copilot.name, "Marketplace names must match");
assert.ok(codex.interface.displayName.trim(), "Codex marketplace needs a display name");
assert.ok(copilot.owner.name.trim(), "Copilot marketplace needs an owner");
assert.ok(Array.isArray(codex.plugins) && codex.plugins.length > 0);
assert.deepEqual(codex.plugins.map(({ name }) => name), copilot.plugins.map(({ name }) => name),
  "Marketplace plugin names and order must match");
assert.equal(new Set(codex.plugins.map(({ name }) => name)).size, codex.plugins.length,
  "Plugin names must be unique");

for (const [index, entry] of codex.plugins.entries()) {
  const counterpart = copilot.plugins[index];
  assert.equal(entry.source.source, "local");
  assert.equal(entry.source.path, `./plugins/${entry.name}`,
    "Each plugin must have its own directory under plugins/");
  const pluginRoot = localPath(root, entry.source.path);
  assert.equal(pluginRoot, localPath(root, counterpart.source));
  assert.ok(["AVAILABLE", "NOT_AVAILABLE", "INSTALLED_BY_DEFAULT"].includes(entry.policy.installation));
  assert.ok(["ON_INSTALL", "ON_USE"].includes(entry.policy.authentication));
  assert.ok(entry.category.trim());
  assert.equal(entry.category.toLowerCase(), counterpart.category.toLowerCase());

  const manifest = readJson(resolve(pluginRoot, ".codex-plugin/plugin.json"));
  const other = readJson(resolve(pluginRoot, ".github/plugin/plugin.json"));
  assert.equal(manifest.name, entry.name);
  assert.match(manifest.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/);
  for (const field of ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"]) {
    assert.ok(manifest[field], `Missing plugin metadata: ${field}`);
    assert.deepEqual(manifest[field], other[field], `Plugin metadata must match: ${field}`);
  }
  assert.ok(manifest.author.name.trim());
  assert.ok(manifest.interface.displayName.trim());
  if (manifest.skills !== undefined || other.skills !== undefined) {
    assert.equal(localPath(pluginRoot, manifest.skills), localPath(pluginRoot, other.skills));
  }
}

console.log(`Validated ${codex.plugins.length} plugin(s) in both ${codex.name} marketplaces.`);
