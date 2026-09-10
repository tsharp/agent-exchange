import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readRagConfig } from "../src/rag/config.ts";
import { RecordStore, parseRecord, matches } from "../src/rag/records.ts";
import { DocumentCache } from "../src/rag/cache.ts";
import { withLock } from "../src/rag/files.ts";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "geist-rag-test-"));
  t.after(() => {
    assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}geist-rag-test-`));
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(join(root, ".geist"));
  writeFileSync(join(root, ".geist", "config.toml"), '[rag]\nenabled = true\nmin_score = 0\n');
  const config = readRagConfig(root);
  const store = new RecordStore(config);
  let calls = 0;
  const embedder = { signature: "fixture-v1", async embed(texts) {
    calls += texts.length;
    return texts.map((text) => /database|postgres/i.test(text) ? [1, 0] : [0, 1]);
  } };
  return { root, config, store, embedder, cache: new DocumentCache(store, embedder), calls: () => calls };
}

test("record writes preserve raw metadata and enforce version checks", async (t) => {
  const { store } = fixture(t);
  const markdown = '---\nkind: decision\ncustom: {owner: team}\n# preserved comment\n---\n# Database\nUse PostgreSQL.\n';
  const created = await store.write("decisions/database.md", markdown);
  assert.equal(store.get(created.id).markdown, markdown);
  assert.deepEqual(created.frontmatter.custom, { owner: "team" });
  await assert.rejects(store.write(created.id, "replacement"), { code: "already_exists" });
  await assert.rejects(store.write(created.id, "replacement", "stale"), { code: "conflict" });
  const updated = await store.write(created.id, `${markdown}\nRevision`, created.version);
  await assert.rejects(store.delete(created.id, created.version), { code: "conflict" });
  await store.delete(created.id, updated.version);
  assert.throws(() => store.get(created.id), { code: "not_found" });
});

test("version hashes preserve BOM bytes and invalid UTF-8 is rejected", async (t) => {
  const { store } = fixture(t);
  const raw = "\uFEFF---\nkind: fact\n---\n# Unicode\nCafé";
  const created = await store.write("unicode.md", raw);
  const record = store.get(created.id);
  assert.equal(record.markdown, raw);
  assert.equal(record.version, createHash("sha256").update(Buffer.from(raw)).digest("hex"));
  assert.equal(record.version, created.version);
  writeFileSync(store.path(created.id), Buffer.from([0xff, 0xfe]));
  assert.throws(() => store.get(created.id), { code: "invalid_record" });
  assert.equal(store.scan().warnings.length, 1);
});

test("live and recovering locks stay exclusive and dead worker locks are reclaimed", async (t) => {
  const { config } = fixture(t);
  await withLock(config, "index", async () => {
    await assert.rejects(withLock(config, "index", () => assert.fail("must not enter")), { code: "busy" });
  });
  const dead = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  assert.equal(dead.status, 0);
  const path = join(config.cacheDirectory, "index.lock");
  writeFileSync(path, JSON.stringify({ pid: Number(dead.stdout) }));
  writeFileSync(`${path}.reclaim`, "");
  await assert.rejects(withLock(config, "index", () => assert.fail("must not enter")), { code: "busy" });
  assert.equal(existsSync(path), true);
  unlinkSync(`${path}.reclaim`);
  assert.equal(await withLock(config, "index", () => "recovered"), "recovered");
  assert.equal(existsSync(path), false);
  assert.equal(existsSync(`${path}.reclaim`), false);
});

test("frontmatter validates shapes and retains unknown values", () => {
  assert.equal(parseRecord("a.md", "# Plain").title, "Plain");
  assert.equal(parseRecord("a.md", '---\nstate: future\n---\nbody').frontmatter.state, "future");
  for (const yaml of ["scope: 12", "links: [{kind: supports}]", "sources: [{source: x, date: '2026-02-31'}]", "kind: [x]", "[one, two]", "custom: &cycle {self: *cycle}"]) {
    assert.throws(() => parseRecord("a.md", `---\n${yaml}\n---\nbody`));
  }
  const record = parseRecord("a.md", '---\nkind: fact\nscope: ["path:src", "service:api"]\n---\nbody');
  assert.equal(matches(record, { kind: ["fact"], scope: ["service:api"] }), true);
  assert.equal(matches(record, { kind: ["decision"], scope: ["service:api"] }), false);
});

test("records cannot escape the root through IDs or linked directories", async (t) => {
  const { root, store } = fixture(t);
  for (const id of ["../escape.md", "a/../../escape.md", "/absolute.md", "C:/absolute.md", "a\\b.md", "x.md:stream", "file.txt"]) {
    await assert.rejects(store.write(id, "body"));
  }
  mkdirSync(join(root, "docs"));
  const outside = join(root, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "secret.md"), "outside");
  symlinkSync(outside, join(root, "docs", "linked"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => store.get("linked/secret.md"));
  await assert.rejects(store.write("linked/new.md", "body"));
  assert.equal(store.scan().records.length, 0);
  assert.equal(store.scan().warnings.length, 1);
});

test("backlinks survive as unresolved outgoing edges after deletion", async (t) => {
  const { store } = fixture(t);
  await store.write("a.md", '---\nlinks:\n  - record: b.md\n    kind: supports\n---\nA');
  const b = await store.write("b.md", "B");
  assert.equal(store.links("b.md").incoming[0].source, "a.md");
  await store.delete("b.md", b.version);
  assert.equal(store.links("a.md").outgoing[0].resolved, false);
});

test("cache reuses embeddings and follows edits, renames, and deletes", async (t) => {
  const f = fixture(t);
  await f.store.write("a.md", "# Database\nUse Postgres.");
  await f.store.write("b.md", "# Cooking\nBake bread.");
  assert.equal((await f.cache.refresh()).refresh.updated, 2);
  const calls = f.calls();
  assert.equal((await f.cache.refresh()).refresh.reused, 2);
  assert.equal(f.calls(), calls);
  const path = f.store.path("a.md");
  const originalTime = new Date(100000);
  utimesSync(path, originalTime, originalTime);
  writeFileSync(path, "# Database\nUse new Postgres settings.");
  utimesSync(path, originalTime, originalTime);
  assert.equal((await f.cache.refresh()).refresh.updated, 1);
  renameSync(path, f.store.path("renamed.md"));
  const renamed = await f.cache.refresh();
  assert.equal(renamed.refresh.updated, 1);
  assert.equal(renamed.refresh.removed, 1);
  unlinkSync(f.store.path("b.md"));
  assert.equal((await f.cache.refresh()).refresh.removed, 1);
});

test("cache rebuilds after corruption, signature changes, and explicit rebuild", async (t) => {
  const f = fixture(t);
  await f.store.write("a.md", "Database");
  await f.cache.refresh();
  const path = join(f.config.cacheDirectory, "documents.json");
  writeFileSync(path, "invalid JSON");
  assert.equal((await f.cache.refresh()).refresh.updated, 1);
  f.embedder.signature = "fixture-v2";
  assert.equal((await f.cache.refresh()).refresh.updated, 1);
  assert.equal((await f.cache.refresh(true)).refresh.updated, 1);
  const saved = JSON.parse(readFileSync(path, "utf8"));
  saved.format = "unknown";
  writeFileSync(path, JSON.stringify(saved));
  assert.equal((await f.cache.refresh()).refresh.updated, 1);
});

test("search ranks distinct active records, applies filters, and never persists queries", async (t) => {
  const f = fixture(t);
  await f.store.write("a.md", '---\nkind: decision\nscope: ["service:api"]\n---\nDatabase');
  await f.store.write("b.md", '---\nstate: superseded\n---\nDatabase');
  await f.store.write("c.md", "Cooking");
  const query = "database private unique user prompt";
  const result = await f.cache.search(query);
  assert.deepEqual(result.matches.map((match) => match.id), ["a.md", "c.md"]);
  assert.equal(result.matches[0].score, 1);
  assert.equal(result.matches[0].version, f.store.get("a.md").version);
  assert.deepEqual((await f.cache.search(query, { state: ["superseded"] })).matches.map((match) => match.id), ["b.md"]);
  assert.deepEqual((await f.cache.search(query, { scope: ["service:api"] })).matches.map((match) => match.id), ["a.md"]);
  assert.equal(readFileSync(join(f.config.cacheDirectory, "documents.json"), "utf8").includes(query), false);
});

test("failed inference leaves the previous snapshot intact", async (t) => {
  const f = fixture(t);
  await f.store.write("a.md", "Database");
  await f.cache.refresh();
  const path = join(f.config.cacheDirectory, "documents.json");
  const before = readFileSync(path, "utf8");
  writeFileSync(f.store.path("a.md"), "changed");
  f.embedder.embed = async () => { throw new Error("inference failed"); };
  await assert.rejects(f.cache.refresh());
  assert.equal(readFileSync(path, "utf8"), before);
  assert.equal(existsSync(join(f.config.cacheDirectory, "index.lock")), false);
});

test("search returns multiple chunks per document and edits reuse unaffected vectors", async (t) => {
  const f = fixture(t);
  await f.store.write("guide.md", "## Database\nPostgres settings.\n## Cooking\nBread recipes.");
  const first = await f.cache.search("database");
  assert.equal(first.matches.length, 2);
  assert.deepEqual(first.matches.map((m) => m.id), ["guide.md", "guide.md"]);
  assert.notEqual(first.matches[0].chunk_id, first.matches[1].chunk_id);
  const cooking = first.matches.find((m) => m.content.includes("Bread"));
  const calls = f.calls();
  writeFileSync(f.store.path("guide.md"), "## Database\nUpdated Postgres settings.\n## Cooking\nBread recipes.");
  await f.cache.refresh();
  assert.equal(f.calls() - calls, 1, "only changed chunk is embedded");
  const next = await f.cache.search("database");
  assert.equal(next.matches.find((m) => m.content.includes("Bread")).chunk_id, cooking.chunk_id);
});

test("RAG config validates bounds and workspace containment", (t) => {
  const { root } = fixture(t);
  for (const content of ['root = "../outside"', 'top_k = 0', 'timeout_ms = 5000', 'unknown = true']) {
    writeFileSync(join(root, ".geist", "config.toml"), `[rag]\n${content}\n`);
    assert.throws(() => readRagConfig(root));
  }
});
