import "./test-user-env.mjs";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readRagConfig, initializeUserData, repositoryId } from "../src/rag/config.ts";
import { storeConfigs, automaticConfig, searchStores } from "../src/rag/library.ts";
import { RecordStore } from "../src/rag/records.ts";
import { injectWorkspaceContext } from "../src/hooks/stages/workspace-context.ts";
import { deliverHints } from "../src/hooks/stages/rag-delivery.ts";
import { createRagServer } from "../src/rag/server.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

function fixture(t) {
  const previous = process.env.GEIST_USER_DIR;
  const base = mkdtempSync(join(previous, "case-"));
  process.env.GEIST_USER_DIR = join(base, "user");
  t.after(() => { process.env.GEIST_USER_DIR = previous; });
  const user = initializeUserData();
  const workspace = join(base, "project");
  mkdirSync(join(workspace, ".geist"), { recursive: true });
  writeFileSync(join(workspace, ".geist", "config.toml"), '[rag]\nenabled=true\nmin_score=0\n');
  writeFileSync(join(user, "config.toml"), '[rag]\nenabled=true\nmin_score=0\n');
  const embedder = { signature: "global-fixture", calls: 0, async embed(texts) { this.calls += texts.length; return texts.map(() => [1, 0]); } };
  return { user, workspace, embedder };
}

test("user data is sync-ready and caches are centralized with isolated repository identities", async (t) => {
  const { user, workspace, embedder } = fixture(t);
  writeFileSync(join(user, ".gitignore"), "# user's rules\nsecrets/\n");
  initializeUserData(); initializeUserData();
  assert.equal(readFileSync(join(user, ".gitignore"), "utf8"), "# user's rules\nsecrets/\n/cache/\n/temp/\n");
  assert.ok(existsSync(join(user, "docs")) && existsSync(join(user, "temp")));
  assert.equal(existsSync(join(user, ".git")), false);
  const configs = storeConfigs(workspace);
  assert.equal(configs[0].cacheDirectory, join(user, "cache", repositoryId(workspace), "rag"));
  assert.equal(configs[1].cacheDirectory, join(user, "cache", "global", "rag"));
  for (const config of configs) await new RecordStore(config).write("same.md", "Shared wording.");
  const first = await searchStores(configs, embedder, "wording");
  assert.deepEqual(first.matches.map((m) => m.store), ["global", "workspace"]);
  assert.equal(first.matches[0].chunk_id, first.matches[1].chunk_id);
  assert.equal(existsSync(join(workspace, ".geist", "cache")), false);
  const other = join(workspace, "other"); mkdirSync(other);
  assert.notEqual(repositoryId(other), repositoryId(workspace));
  const second = await searchStores(storeConfigs(other), embedder, "wording");
  assert.equal(second.refresh.reused, 1, "global vectors are shared between workspaces");
  const request = { host: "codex", event: "UserPromptSubmit", workspace, input: { session_id: "test" } };
  assert.ok(await deliverHints(configs[0], request, [first.matches[0]]));
  const next = await deliverHints(configs[0], request, first.matches);
  assert.deepEqual(JSON.parse(next.slice(next.indexOf("\n") + 1)).map((m) => m.store), ["workspace"]);
});

test("global and local instruction lists preserve order and independent configuration", (t) => {
  const { user, workspace } = fixture(t);
  writeFileSync(join(user, "config.toml"), '[instructions]\nfiles=["two.md", "one.md"]\n[rag]\nenabled=true\ntop_k=2\n');
  writeFileSync(join(user, "one.md"), "global one"); writeFileSync(join(user, "two.md"), "global two");
  writeFileSync(join(workspace, ".geist", "config.toml"), '[instructions]\nfiles=["b.md", "a.md"]\n');
  writeFileSync(join(workspace, ".geist", "a.md"), "local a"); writeFileSync(join(workspace, ".geist", "b.md"), "local b");
  const response = { instructions: [], context: [] };
  injectWorkspaceContext.run({ event: "SessionStart", workspace }, response);
  assert.deepEqual(response.instructions, ["global two", "global one", "local b", "local a"]);
  const config = automaticConfig(workspace);
  assert.equal(config.enabled, true); assert.equal(config.topK, 2);
  assert.equal(config.workspace, workspace);
  assert.equal(config.cacheDirectory, readRagConfig(workspace).cacheDirectory);
  assert.equal(readRagConfig(workspace).enabled, false);
});

test("global record roots and centralized cache links enforce containment", (t) => {
  const { user, workspace } = fixture(t);
  writeFileSync(join(user, "config.toml"), '[rag]\nroot="../escape"\n');
  assert.throws(() => readRagConfig(workspace, "global"), { code: "invalid_id" });
  writeFileSync(join(user, "config.toml"), '[rag]\nroot="."\n');
  assert.throws(() => readRagConfig(workspace, "global"), { code: "invalid_config" });
  symlinkSync(workspace, join(user, "cache"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => readRagConfig(workspace), { code: "invalid_id" });
});

test("opening the user directory deduplicates shared roots while explicit store selection works", async (t) => {
  const { user, workspace, embedder } = fixture(t);
  await new RecordStore(readRagConfig(workspace, "global")).write("shared.md", "Personal notes");
  const configs = storeConfigs(user);
  assert.equal((await searchStores(configs, embedder, "notes")).matches.length, 1);
  const explicit = await searchStores(configs.filter((config) => config.store === "workspace"), embedder, "notes");
  assert.equal(explicit.matches.length, 1);
  assert.equal(explicit.matches[0].store, "workspace");
});

test("MCP addresses global records explicitly and searches and lists both stores", async (t) => {
  const { workspace, embedder } = fixture(t);
  const server = createRagServer(workspace, async () => embedder);
  const client = new Client({ name: "global-test", version: "1" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(right); await client.connect(left);
  t.after(async () => { await client.close(); await server.close(); });
  const call = async (name, args = {}) => (await client.callTool({ name, arguments: args })).structuredContent;
  const global = await call("create_record", { store: "global", id: "a.md", markdown: "Global document" });
  await call("create_record", { id: "a.md", markdown: "Local document" });
  assert.equal((await call("get_record", { store: "global", id: "a.md" })).body, "Global document");
  assert.equal((await call("get_record", { id: "a.md" })).body, "Local document");
  assert.equal((await call("list_records")).total, 2);
  assert.equal((await call("list_records", { store: "global" })).total, 1);
  assert.deepEqual((await call("search_records", { query: "document" })).matches.map((m) => m.store), ["global", "workspace"]);
  assert.equal((await call("rebuild_cache", { store: "global" })).total, 1);
  const updated = await call("update_record", { store: "global", id: "a.md", expected_version: global.record.version, markdown: "Revised" });
  await call("delete_record", { store: "global", id: "a.md", expected_version: updated.record.version });
  assert.equal((await call("list_records")).total, 1);
});
