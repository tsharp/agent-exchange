import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

// Explicit integration test: runs the real Codex loader with no user config or model turn.
test("Codex installs the shipped manifest and initializes Geist from another workspace", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "geist-codex-mcp-"));
  const marketplace = join(directory, "marketplace with spaces");
  const plugin = join(marketplace, "plugins", "geist");
  const workspace = join(directory, "consumer");
  const testHome = join(directory, "codex-home");
  for (const path of [plugin, workspace, testHome, join(marketplace, ".agents", "plugins")]) mkdirSync(path, { recursive: true });
  t.after(() => {
    assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}geist-codex-mcp-`));
    rmSync(directory, { recursive: true, force: true });
  });
  for (const entry of [".codex-plugin", ".mcp.json", "plugin.json", "mcp.json", "runtime", "skills"]) {
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
  const child = spawn(codex, ["app-server"], { cwd: workspace, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  try {
    await new Promise((resolveReady, reject) => {
      let buffer = "", stderr = "";
      const timer = setTimeout(() => finish(new Error(`Codex startup timed out: ${stderr.slice(-1500)}`)), 20000);
      let done = false;
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
            if (message.params.status === "ready") finish();
          }
        }
      });
      send({ id: 1, method: "initialize", params: { clientInfo: { name: "geist-startup-test", version: "1.0.0" }, capabilities: { experimentalApi: true } } });
    });
  } finally {
    child.stdin.end();
    await new Promise((done) => {
      const timer = setTimeout(() => { child.kill(); child.stdout.destroy(); child.stderr.destroy(); child.stdin.destroy(); done(); }, 1500);
      child.once("close", () => { clearTimeout(timer); done(); });
    });
  }
});
