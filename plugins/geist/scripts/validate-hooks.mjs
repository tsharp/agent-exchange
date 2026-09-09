import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EVENTS } from "../src/hooks/pipeline.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const packageJson = readJson("package.json");
const codex = readJson(".codex-plugin/plugin.json");
const copilot = readJson(".github/plugin/plugin.json");
assert.equal(codex.name, packageJson.name);
assert.equal(copilot.name, packageJson.name);
assert.equal(codex.version, packageJson.version);
assert.equal(copilot.version, packageJson.version);
assert.equal(codex.hooks, undefined, "Codex discovers the default hooks/hooks.json");
assert.equal(copilot.hooks, "hooks/copilot-hooks.json");
assert.ok(statSync(resolve(root, "runtime/hooks/run.mjs")).isFile());
assert.ok(statSync(resolve(root, "runtime/rag/run.mjs")).isFile());
assert.ok(statSync(resolve(root, "runtime/mcp/run.mjs")).isFile());
assert.equal(codex.mcpServers, "./.mcp.json");
assert.equal(copilot.mcpServers, ".mcp.json");
assert.deepEqual(readJson(".mcp.json"), { mcpServers: { geist: { command: "node", args: ["${PLUGIN_ROOT}/runtime/mcp/run.mjs"] } } });

for (const host of ["codex", "copilot"]) {
  const config = readJson(host === "codex" ? "hooks/hooks.json" : copilot.hooks);
  const events = host === "codex" ? EVENTS : [
    "sessionStart", "userPromptSubmitted", "subagentStart", "subagentStop", "agentStop", "sessionEnd",
  ];
  assert.deepEqual(Object.keys(config.hooks), events);
  if (host === "copilot") assert.equal(config.version, 1);
  for (const [index, event] of events.entries()) {
    const entries = config.hooks[event];
    assert.equal(entries.length, 1);
    const handlers = host === "codex" ? entries[0].hooks : entries;
    assert.equal(handlers.length, 1);
    const handler = handlers[0];
    assert.equal(handler.type, "command");
    const expected = `node "${'${PLUGIN_ROOT}'}/runtime/hooks/run.mjs" ${host} ${EVENTS[index]}`;
    if (host === "codex") {
      assert.equal(handler.command, expected);
      assert.equal(handler.commandWindows, expected.replace("${PLUGIN_ROOT}", "$env:PLUGIN_ROOT"));
    } else {
      assert.equal(handler.bash, expected);
      assert.equal(handler.powershell,
        expected.replace("${PLUGIN_ROOT}/runtime/hooks/run.mjs", "$env:PLUGIN_ROOT\\runtime\\hooks\\run.mjs"));
    }
    assert.equal(host === "codex" ? handler.timeout : handler.timeoutSec,
      EVENTS[index] === "SessionEnd" ? 3 : 5);
  }
}
console.log("Validated all 12 Geist lifecycle hook mappings and bundled runner.");
