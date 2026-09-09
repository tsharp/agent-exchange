import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("real ONNX ranks records and both prompt hooks inject bounded hints offline", (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "geist-onnx-test-"));
  t.after(() => {
    assert.ok(resolve(workspace).startsWith(`${resolve(tmpdir())}${sep}geist-onnx-test-`));
    rmSync(workspace, { recursive: true, force: true });
  });
  mkdirSync(join(workspace, ".geist"));
  mkdirSync(join(workspace, "docs"));
  const configuration = '[rag]\nenabled = true\nmin_score = 0\ntop_k = 3\nmax_context_chars = 1800\n';
  writeFileSync(join(workspace, ".geist", "config.toml"), configuration);
  const records = {
    "database.md": "# Transaction storage\nPostgreSQL is the relational database for transactional records. ACID transactions preserve consistency. Each service owns its data.",
    "deployment.md": "# Service deployment\nDeploy containers with Kubernetes. Helm charts describe replicas and health checks. Roll back failed deployments.",
    "design.md": "# Visual design\nUse accessible colors, readable typography, and keyboard navigation. CSS grid arranges interface components.",
    "cooking.md": "# Baking bread\nMix flour, yeast, salt and water. Knead the dough and let it rise before baking in a hot oven.",
  };
  for (const [id, body] of Object.entries(records)) writeFileSync(join(workspace, "docs", id), body);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GEIST_")));
  function cli(command, ...args) {
    const started = performance.now();
    const result = spawnSync(process.execPath, [resolve("runtime/rag/run.mjs"), command, workspace, ...args], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    return { ...JSON.parse(result.stdout), elapsed_ms: Math.round(performance.now() - started) };
  }
  const index = cli("index");
  assert.equal(index.updated, 4);
  const query = "Which datastore handles atomic transactions and data consistency?";
  const search = cli("search", query);
  assert.equal(search.matches[0].id, "database.md");
  assert.equal(search.matches.length, 3);
  assert.equal(search.refresh.reused, 4);
  const timings = { index_ms: index.elapsed_ms, search_ms: search.elapsed_ms, hooks_ms: {} };
  for (const host of ["codex", "copilot"]) {
    const session = host === "codex" ? { session_id: "onnx-session" } : { sessionId: "onnx-session" };
    const transformed = `Host-prepared prompt: ${query}`;
    const hook = (event, extra = {}) => {
      const result = spawnSync(process.execPath, [resolve("runtime/hooks/run.mjs"), host, event], {
        env, input: JSON.stringify({ cwd: workspace, prompt: query, transformedPrompt: transformed, ...session, ...extra }), encoding: "utf8", timeout: 5000,
      });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    const hintsFrom = (output) => {
      const context = host === "codex" ? output.hookSpecificOutput?.additionalContext : output.modifiedTransformedPrompt?.slice(transformed.length + 2);
      assert.ok(context);
      assert.match(context, /untrusted reference data/);
      assert.ok(context.length <= 1800);
      if (host === "copilot") assert.ok(output.modifiedTransformedPrompt.startsWith(`${transformed}\n\n`));
      return JSON.parse(context.slice(context.indexOf("\n") + 1));
    };
    const started = performance.now();
    const hints = hintsFrom(hook("UserPromptSubmit"));
    assert.equal(hints.length, 3);
    assert.equal(hints[0].id, "database.md");
    timings.hooks_ms[host] = Math.round(performance.now() - started);
    assert.deepEqual(hook("UserPromptSubmit"), {}, "unchanged real retrieval is suppressed");
    assert.equal(cli("search", query).matches.length, 3, "explicit search ignores delivery state");
    writeFileSync(join(workspace, "docs", "database.md"), `${records["database.md"]}\nRevised record for ${host}.`);
    assert.deepEqual(hintsFrom(hook("UserPromptSubmit")).map((hint) => hint.id), ["database.md"]);
    if (host === "codex") hook("SessionStart", { source: "compact" }); else hook("PreCompact", { trigger: "auto" });
    assert.equal(hintsFrom(hook("UserPromptSubmit")).length, 3);
    hook("SessionEnd");
    writeFileSync(join(workspace, "docs", "database.md"), records["database.md"]);
  }
  writeFileSync(join(workspace, ".geist", "config.toml"), configuration.replace("top_k = 3", "top_k = 1"));
  assert.equal(cli("search", query).matches.length, 1);
  writeFileSync(join(workspace, "docs", "database.md"), `${records["database.md"]}\nUse serializable isolation for account balances.`);
  assert.equal(cli("search", query).refresh.updated, 1);
  assert.equal(cli("rebuild").updated, 4);
  assert.equal(readFileSync(join(workspace, ".geist", "cache", "rag", "documents.json"), "utf8").includes(query), false);
  console.log(`ONNX integration timings: ${JSON.stringify(timings)}`);
});

test("a cold MCP installation prepares ONNX and recovers search without restarting", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "geist-prepared-test-"));
  t.after(() => {
    assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}geist-prepared-test-`));
    rmSync(directory, { recursive: true, force: true });
  });
  const plugin = join(directory, "installed plugin");
  const workspace = join(directory, "project");
  mkdirSync(join(plugin, "scripts"), { recursive: true });
  cpSync(resolve("runtime"), join(plugin, "runtime"), { recursive: true });
  cpSync(resolve("package.json"), join(plugin, "package.json"));
  cpSync(resolve("scripts/setup-rag.mjs"), join(plugin, "scripts/setup-rag.mjs"));
  mkdirSync(join(workspace, ".geist"), { recursive: true });
  mkdirSync(join(workspace, "docs"));
  writeFileSync(join(workspace, ".geist", "config.toml"), '[rag]\nenabled=true\nmin_score=0\n');
  writeFileSync(join(workspace, "docs", "transactions.md"), "# Storage\nPostgreSQL handles atomic transactions.");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GEIST_")));
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [join(plugin, "runtime/mcp/run.mjs")], cwd: workspace, env, stderr: "pipe" });
  const client = new Client({ name: "cold-setup-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const search = () => client.callTool({ name: "search_records", arguments: { query: "Which database stores transactions?" } });
    assert.equal((await search()).structuredContent.error.code, "model_unavailable");
    const prepare = () => client.callTool({ name: "prepare_runtime", arguments: {} }, undefined, { timeout: 300000 });
    const [first, concurrent] = await Promise.all([prepare(), prepare()]);
    assert.equal(first.isError, undefined, JSON.stringify(first));
    assert.equal(first.structuredContent.prepared, true);
    assert.equal(first.structuredContent.dimensions, 384);
    assert.deepEqual(first.structuredContent, concurrent.structuredContent);
    assert.equal((await search()).structuredContent.matches[0].id, "transactions.md");
    // Prove warm preparation requires neither npm nor the setup script.
    rmSync(join(plugin, "scripts/setup-rag.mjs"));
    assert.deepEqual((await prepare()).structuredContent, first.structuredContent);
  } finally { await client.close(); }
});
