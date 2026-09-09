import assert from "node:assert/strict";
import { cpSync, readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

// Explicit integration test: runs the real Codex loader with no user config or model turn.
test("Codex installs Geist, initializes MCP, and discovers removable compatibility hooks", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "geist-codex-mcp-"));
  const marketplace = join(directory, "marketplace with spaces $value's");
  const plugin = join(marketplace, "plugins", "geist");
  const workspace = join(directory, "consumer");
  const testHome = join(directory, "codex-home");
  for (const path of [plugin, workspace, testHome, join(marketplace, ".agents", "plugins")]) mkdirSync(path, { recursive: true });
  t.after(() => {
    assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}geist-codex-mcp-`));
    rmSync(directory, { recursive: true, force: true });
  });
  for (const entry of [".codex-plugin", ".mcp.json", "plugin.json", "mcp.json", "package.json", "runtime", "skills", "hooks", "scripts"]) {
    if (existsSync(resolve(entry))) cpSync(resolve(entry), join(plugin, entry), { recursive: true });
  }
  writeFileSync(join(marketplace, ".agents", "plugins", "marketplace.json"), JSON.stringify({
    name: "geist-startup-test", plugins: [{ name: "geist", source: { source: "local", path: "./plugins/geist" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }],
  }));
  const codex = process.env.GEIST_CODEX_BIN || "codex";
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GEIST_") && !["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"].includes(key)));
  env.CODEX_HOME = testHome;
  const cli = (...args) => {
    const result = spawnSync(codex, args, { cwd: workspace, env, encoding: "utf8", windowsHide: true, timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || String(result.error));
  };
  cli("plugin", "marketplace", "add", marketplace);
  cli("plugin", "add", "geist@geist-startup-test");
  const installedVersion = JSON.parse(readFileSync(resolve("plugin.json"), "utf8")).version;
  const installed = join(testHome, "plugins/cache/geist-startup-test/geist", installedVersion);
  const setup = (action) => {
    const result = spawnSync(process.execPath, [join(installed, "scripts/setup-codex-hooks.mjs"), action, testHome], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  };
  const unrelated = { hooks: [{ type: "command", command: "echo unrelated" }] };
  writeFileSync(join(testHome, "hooks.json"), JSON.stringify({ hooks: { PreToolUse: [unrelated] } }));
  setup("install");
  const first = readFileSync(join(testHome, "hooks.json"), "utf8");
  setup("install");
  assert.equal(readFileSync(join(testHome, "hooks.json"), "utf8"), first, "repeated registration must not duplicate hooks");
  const child = spawn(codex, ["app-server"], { cwd: workspace, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  try {
    await new Promise((resolveReady, reject) => {
      let buffer = "", stderr = "";
      const timer = setTimeout(() => finish(new Error(`Codex startup timed out: ${stderr.slice(-1500)}`)), 20000);
      let done = false, mcpReady = false, hooksReady = false;
      function finish(error) { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolveReady(); }
      const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
      child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-2000); });
      child.on("error", finish);
      child.on("exit", (code) => finish(new Error(`Codex exited before MCP was ready: ${code}; ${stderr}`)));
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        while (buffer.includes("\n")) {
          const end = buffer.indexOf("\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let message; try { message = JSON.parse(line); } catch { continue; }
          if (message.error) { finish(new Error(JSON.stringify(message.error))); continue; }
          if (message.id === 1) {
            send({ method: "initialized" });
            send({ id: 2, method: "thread/start", params: { cwd: workspace, ephemeral: true } });
          }
          if (message.method === "mcpServer/startupStatus/updated" && message.params.name === "geist") {
            if (message.params.status === "failed") finish(new Error(message.params.error));
            if (message.params.status === "ready") {
              mcpReady = true;
              send({ id: 3, method: "hooks/list", params: { cwds: [workspace] } });
            }
          }
          if (message.id === 3) {
            try {
              const entry = message.result.data[0];
              assert.deepEqual(entry.errors, []);
              assert.deepEqual(entry.hooks.filter((hook) => hook.statusMessage?.startsWith("Geist (Agent Exchange) compatibility: ")).map((hook) => hook.eventName).sort(),
                ["sessionStart", "userPromptSubmit", "subagentStart", "subagentStop", "stop", "sessionEnd"].sort(), JSON.stringify(entry) + stderr);
              assert.equal(entry.hooks.length, 7, "preserve the unrelated hook");
              assert.ok(entry.hooks.every((hook) => hook.trustStatus === "untrusted"), "registration must not grant trust");
              mkdirSync(join(workspace, ".geist"));
              writeFileSync(join(workspace, ".geist/config.toml"), '[instructions]\nfiles = ["context.md"]\n');
              writeFileSync(join(workspace, ".geist/context.md"), "Consumer workspace instruction.");
              const sessionStart = entry.hooks.find((hook) => hook.eventName === "sessionStart");
              const executed = spawnSync(process.platform === "win32" ? "pwsh" : "sh",
                process.platform === "win32" ? ["-NoProfile", "-Command", sessionStart.command] : ["-c", sessionStart.command],
                { cwd: workspace, env, input: JSON.stringify({ cwd: workspace, source: "startup" }), encoding: "utf8", timeout: 5000, windowsHide: true });
              assert.equal(executed.status, 0, executed.stderr);
              assert.equal(JSON.parse(executed.stdout).hookSpecificOutput.additionalContext, "Consumer workspace instruction.");
              hooksReady = true;
            } catch (error) { finish(error); }
          }
          if (mcpReady && hooksReady) finish();
        }
      });
      send({ id: 1, method: "initialize", params: { clientInfo: { name: "geist-startup-test", version: "1.0.0" }, capabilities: { experimentalApi: true } } });
    });
  } finally {
    setup("remove");
    assert.deepEqual(JSON.parse(readFileSync(join(testHome, "hooks.json"), "utf8")), { hooks: { PreToolUse: [unrelated] } });
    child.stdin.end();
    await new Promise((done) => {
      const timer = setTimeout(() => { child.kill(); child.stdout.destroy(); child.stderr.destroy(); child.stdin.destroy(); done(); }, 1500);
      child.once("close", () => { clearTimeout(timer); done(); });
    });
  }
});
