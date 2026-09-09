import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRagServer } from "../src/rag/server.ts";

function workspace(t) {
  const path = mkdtempSync(join(tmpdir(), "geist-mcp-test-"));
  t.after(() => {
    assert.ok(resolve(path).startsWith(`${resolve(tmpdir())}${sep}geist-mcp-test-`));
    rmSync(path, { recursive: true, force: true });
  });
  mkdirSync(join(path, ".geist"));
  writeFileSync(join(path, ".geist", "config.toml"), "[rag]\nenabled = true\nmin_score = 0\n");
  return path;
}

test("MCP exposes preparation and round trips record tools with versions, filters, and structured errors", async (t) => {
  const path = workspace(t);
  let loads = 0;
  const server = createRagServer(path, async () => {
    loads++;
    return { signature: "mcp-fixture", async embed(texts) { return texts.map(() => [1, 0]); } };
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return { ...result.structuredContent, isError: result.isError };
  };
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 9);
  assert.equal(tools.find((tool) => tool.name === "prepare_runtime").annotations.openWorldHint, true);
  assert.equal((await call("list_records")).total, 0);
  const created = await call("create_record", { id: "a.md", markdown: '---\nkind: fact\ncustom: kept\nlinks: [{record: b.md}]\n---\n# Database\nPostgres' });
  assert.equal(created.record.frontmatter.custom, "kept");
  assert.equal(loads, 0, "record tools must not load ONNX");
  assert.equal((await call("get_record", { id: "a.md" })).markdown, created.record.markdown);
  assert.equal((await call("get_record", { id: "../escape.md" })).error.code, "invalid_id");
  assert.equal((await call("get_record", { id: "missing.md" })).error.code, "not_found");
  assert.equal((await call("create_record", { id: "a.md", markdown: "collision" })).error.code, "already_exists");
  assert.equal((await call("create_record", { id: "bad.md", markdown: '---\nkind: []\n---\nbody' })).error.code, "invalid_record");
  await call("create_record", { id: "b.md", markdown: "# Other" });
  assert.equal((await call("list_records", { kind: ["fact"] })).total, 1);
  assert.equal((await call("list_records", { limit: 1 })).next_offset, 1);
  assert.equal((await call("get_links", { id: "b.md" })).incoming[0].source, "a.md");
  assert.equal((await call("rebuild_cache")).updated, 2);
  assert.equal((await call("search_records", { query: "database", limit: 1 })).matches[0].id, "a.md");
  assert.equal(loads, 1);
  const updated = await call("update_record", { id: "a.md", markdown: `${created.record.markdown}\nUpdated`, expected_version: created.record.version });
  assert.notEqual(updated.record.version, created.record.version);
  assert.equal((await call("delete_record", { id: "a.md", expected_version: created.record.version })).error.code, "conflict");
  assert.equal((await call("delete_record", { id: "a.md", expected_version: updated.record.version })).id, "a.md");
  assert.equal((await call("search_records", { query: "database" })).refresh.removed, 1);
  const invalid = await client.callTool({ name: "list_records", arguments: { limit: 0 } });
  assert.equal(invalid.isError, true);
});

test("copied MCP bundle starts and edits records without node_modules or models", async (t) => {
  let client;
  t.after(async () => { await client?.close(); });
  const path = workspace(t);
  const plugin = join(path, "installed Geist");
  mkdirSync(plugin);
  cpSync(resolve("runtime"), join(plugin, "runtime"), { recursive: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GEIST_")));
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(plugin, "runtime", "mcp", "run.mjs")], cwd: path, env, stderr: "pipe" });
  client = new Client({ name: "installed-test", version: "1.0.0" });
  await client.connect(transport);
  const result = await client.callTool({ name: "create_record", arguments: { id: "hello.md", markdown: "# Hello" } });
  assert.equal(result.structuredContent.record.title, "Hello");
  const search = await client.callTool({ name: "search_records", arguments: { query: "hello" } });
  assert.equal(search.isError, true);
  assert.equal(search.structuredContent.error.code, "model_unavailable");
});
