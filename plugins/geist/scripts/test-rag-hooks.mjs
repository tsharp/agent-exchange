import "./test-user-env.mjs";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { automaticRag, queryWorker } from "../src/hooks/stages/automatic-rag.ts";
import { deliverHints, formatHints, resetDelivery } from "../src/hooks/stages/rag-delivery.ts";
import { readRagConfig } from "../src/rag/config.ts";
import { createDefaultPipeline } from "../src/hooks/default-pipeline.ts";

function fixture(t) {
  const workspace = mkdtempSync(join(tmpdir(), "geist-delivery-test-"));
  t.after(() => {
    assert.ok(resolve(workspace).startsWith(`${resolve(tmpdir())}${sep}geist-delivery-test-`));
    rmSync(workspace, { recursive: true, force: true });
  });
  mkdirSync(join(workspace, ".geist"));
  writeFileSync(join(workspace, ".geist", "config.toml"), "[rag]\nenabled=true\n");
  const config = readRagConfig(workspace);
  const request = { host: "codex", event: "UserPromptSubmit", workspace, input: { session_id: "private/session:one", prompt: "private question" } };
  const matches = ["a", "b", "c", "d"].map((id) => ({ store: "workspace", id: `${id}.md`, version: "a".repeat(64), chunk_id: id, chunk_version: "a".repeat(64), content: "private excerpt", headings: [], metadata: {}, start: 0, end: 15, title: `Title ${id}`, path: `/docs/${id}.md`, score: 1, excerpt: "private excerpt" }));
  return { workspace, config, request, matches };
}

const ids = (text) => text ? JSON.parse(text.slice(text.indexOf("\n") + 1)).map((hint) => hint.id) : [];

test("delivery tracks chunks within one document independently of its version", async (t) => {
  const { config, request, matches } = fixture(t);
  const first = { ...matches[0], id: "guide.md" };
  const second = { ...matches[1], id: "guide.md" };
  assert.deepEqual(ids(await deliverHints(config, request, [first])), ["guide.md"]);
  assert.deepEqual(ids(await deliverHints(config, request, [{ ...first, version: "f".repeat(64) }, second])), ["guide.md"]);
  assert.equal(await deliverHints(config, request, [first, second]), "");
});

test("session delivery suppresses repeats without backfill and permits changed versions", async (t) => {
  const { config, request, matches } = fixture(t);
  assert.deepEqual(ids(await deliverHints(config, request, matches)), ["a.md", "b.md", "c.md"]);
  assert.equal(await deliverHints(config, request, matches), "", "do not backfill d.md");
  const changed = matches.map((match, index) => index === 1 ? { ...match, chunk_version: "b".repeat(64) } : match);
  assert.deepEqual(ids(await deliverHints(config, request, changed)), ["b.md"]);
  const directory = join(config.cacheDirectory, "sessions");
  const files = readdirSync(directory);
  assert.match(files[0], /^[0-9a-f]{64}\.json$/);
  const raw = readFileSync(join(directory, files[0]), "utf8");
  assert.deepEqual(JSON.parse(raw), { format: 2, delivered: [
    { id: JSON.stringify(["workspace", "a.md", "a"]), version: "a".repeat(64) }, { id: JSON.stringify(["workspace", "c.md", "c"]), version: "a".repeat(64) }, { id: JSON.stringify(["workspace", "b.md", "b"]), version: "b".repeat(64) },
  ] });
  for (const privateValue of [request.input.session_id, request.input.prompt, "private excerpt", "Title", "/docs/"]) assert.equal(raw.includes(privateValue), false);
});

test("only hints fitting the budget are remembered, and identities remain isolated", async (t) => {
  const { config, request, matches } = fixture(t);
  const constrained = { ...config, maxContextChars: 256 };
  const tooLarge = [{ ...matches[0], title: "x".repeat(160), content: "x".repeat(240) }];
  assert.equal(await deliverHints(constrained, request, tooLarge), "");
  assert.deepEqual(ids(await deliverHints(config, request, tooLarge)), ["a.md"]);
  const otherSession = { ...request, input: { session_id: "other" } };
  assert.deepEqual(ids(await deliverHints(config, otherSession, tooLarge)), ["a.md"]);
  assert.deepEqual(ids(await deliverHints(config, { ...request, host: "copilot" }, tooLarge)), ["a.md"]);
  assert.deepEqual(ids(await deliverHints({ ...config, root: join(config.workspace, "other-docs") }, request, tooLarge)), ["a.md"]);
  const noSession = { ...request, input: {} };
  assert.ok(await deliverHints(config, noSession, tooLarge));
  assert.ok(await deliverHints(config, noSession, tooLarge));
  assert.equal(readdirSync(join(config.cacheDirectory, "sessions")).length, 4);
});

test("corrupt delivery state recovers and linked state directories are rejected", async (t) => {
  const f = fixture(t);
  await deliverHints(f.config, f.request, f.matches);
  const directory = join(f.config.cacheDirectory, "sessions");
  writeFileSync(join(directory, readdirSync(directory)[0]), "invalid JSON");
  assert.equal(ids(await deliverHints(f.config, f.request, f.matches)).length, 3);
  await resetDelivery(f.config, f.request);
  assert.equal(readdirSync(directory).length, 0);
  const other = fixture(t);
  mkdirSync(other.config.cacheDirectory, { recursive: true });
  symlinkSync(directory, join(other.config.cacheDirectory, "sessions"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(deliverHints(other.config, other.request, other.matches), { code: "invalid_id" });
  assert.equal(readdirSync(directory).length, 0);
});

test("blocked processing and missing Copilot transformed prompts consume no delivery state", async (t) => {
  const { config, request } = fixture(t);
  const pipeline = createDefaultPipeline([{ name: "gate", run(_request, response) { response.decision = "block"; response.reason = "blocked"; } }]);
  assert.equal((await pipeline.run(request)).decision, "block");
  await assert.rejects(createDefaultPipeline([{ name: "failure", run() { throw new Error("stage failed"); } }]).run(request), /stage failed/);
  await automaticRag.run({ ...request, host: "copilot" }, { instructions: [], context: [] });
  assert.equal(existsSync(config.cacheDirectory), false);
});

for (const host of ["codex", "copilot"]) {
  test(`${host} emitted hooks deduplicate across processes and reset on lifecycle events`, (t) => {
    const { workspace, config, matches } = fixture(t);
    const installed = join(workspace, "installed");
    mkdirSync(join(installed, "runtime", "hooks"), { recursive: true });
    mkdirSync(join(installed, "runtime", "rag"));
    cpSync(resolve("runtime/hooks/run.mjs"), join(installed, "runtime/hooks/run.mjs"));
    writeFileSync(join(workspace, "matches.json"), JSON.stringify({ matches }));
    writeFileSync(join(installed, "runtime/rag/run.mjs"), 'import { readFileSync } from "node:fs"; import { join } from "node:path"; for await (const chunk of process.stdin) {} process.stdout.write(readFileSync(join(process.argv[3], "matches.json")));');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key === "GEIST_USER_DIR" || !key.startsWith("GEIST_")));
    const session = host === "codex" ? { session_id: "thread-one" } : { sessionId: "thread-one" };
    const original = "Original transformed prompt\nwith preserved formatting.";
    const run = (event, fields = {}) => {
      const result = spawnSync(process.execPath, [join(installed, "runtime/hooks/run.mjs"), host, event], {
        env, input: JSON.stringify({ cwd: workspace, ...session, prompt: "query", transformedPrompt: original, ...fields }), encoding: "utf8", timeout: 5000,
      });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    const context = (output) => {
      if (host === "codex") return output.hookSpecificOutput?.additionalContext ?? "";
      if (!output.modifiedTransformedPrompt) return "";
      assert.ok(output.modifiedTransformedPrompt.startsWith(`${original}\n\n`));
      return output.modifiedTransformedPrompt.slice(original.length + 2);
    };
    assert.equal(ids(context(run("UserPromptSubmit"))).length, 3);
    assert.deepEqual(run("UserPromptSubmit"), {});
    run("SessionStart", { source: "resume" });
    run("SubagentStart");
    run("Stop");
    assert.deepEqual(run("UserPromptSubmit"), {});
    writeFileSync(join(workspace, "matches.json"), JSON.stringify({ matches: matches.map((match, index) => index === 0 ? { ...match, chunk_version: "c".repeat(64) } : match) }));
    assert.deepEqual(ids(context(run("UserPromptSubmit"))), ["a.md"]);
    if (host === "codex") run("SessionStart", { source: "compact" }); else run("PreCompact", { trigger: "auto" });
    assert.equal(ids(context(run("UserPromptSubmit"))).length, 3);
    assert.deepEqual(run("UserPromptSubmit"), {});
    run("SessionStart", { source: host === "codex" ? "clear" : "new" });
    assert.equal(ids(context(run("UserPromptSubmit"))).length, 3);
    run("SessionEnd");
    assert.equal(readdirSync(join(config.cacheDirectory, "sessions")).length, 0);
    assert.equal(ids(context(run("UserPromptSubmit"))).length, 3);
  });
}

test("hint formatting enforces top_k and the total context budget", () => {
  const matches = Array.from({ length: 10 }, (_, index) => ({ id: `${index}.md`, title: `Document ${index}`, path: `/docs/${index}.md`, score: 1, chunk_id: String(index), content: "x".repeat(300) }));
  const output = formatHints(matches, { topK: 3, maxContextChars: 1800 }).text;
  assert.match(output, /untrusted reference data/);
  assert.equal(JSON.parse(output.slice(output.indexOf("\n") + 1)).length, 3);
  assert.ok(output.length <= 1800);
  assert.ok(formatHints(matches, { topK: 20, maxContextChars: 256 }).text.length <= 256);
  assert.equal(formatHints([], { topK: 3, maxContextChars: 1800 }).text, "");
});

test("worker timeout is bounded and native model failures leave hooks usable", async (t) => {
  const path = mkdtempSync(join(tmpdir(), "geist-rag-hook-"));
  t.after(() => {
    assert.ok(resolve(path).startsWith(`${resolve(tmpdir())}${sep}geist-rag-hook-`));
    rmSync(path, { recursive: true, force: true });
  });
  const worker = join(path, "slow.mjs");
  writeFileSync(worker, "setTimeout(() => {}, 10000);");
  const started = performance.now();
  await assert.rejects(queryWorker({ workspace: path, timeoutMs: 150 }, "private prompt", worker), /timed out/);
  assert.ok(performance.now() - started < 1500);
  mkdirSync(join(path, ".geist"));
  writeFileSync(join(path, ".geist", "config.toml"), "[rag]\nenabled=true\ntimeout_ms=100\n");
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => key === "GEIST_USER_DIR" || !key.startsWith("GEIST_")));
  for (const host of ["codex", "copilot"]) {
    const result = spawnSync(process.execPath, [resolve("runtime/hooks/run.mjs"), host, "UserPromptSubmit"], {
      env: environment, input: JSON.stringify({ cwd: path, prompt: "database" }), encoding: "utf8", timeout: 2000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
  }
});
