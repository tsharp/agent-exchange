import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { formatHints, queryWorker } from "../src/hooks/stages/automatic-rag.ts";

test("hint formatting enforces top_k and the total context budget", () => {
  const matches = Array.from({ length: 10 }, (_, index) => ({ id: `${index}.md`, title: `Document ${index}`, path: `/docs/${index}.md`, score: 1, excerpt: "x".repeat(300) }));
  const output = formatHints(matches, { topK: 3, maxContextChars: 1800 });
  assert.match(output, /untrusted reference data/);
  assert.equal(JSON.parse(output.slice(output.indexOf("\n") + 1)).length, 3);
  assert.ok(output.length <= 1800);
  assert.ok(formatHints(matches, { topK: 20, maxContextChars: 256 }).length <= 256);
  assert.equal(formatHints([], { topK: 3, maxContextChars: 1800 }), "");
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
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GEIST_")));
  for (const host of ["codex", "copilot"]) {
    const result = spawnSync(process.execPath, [resolve("runtime/hooks/run.mjs"), host, "UserPromptSubmit"], {
      env: environment, input: JSON.stringify({ cwd: path, prompt: "database" }), encoding: "utf8", timeout: 2000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
  }
});
