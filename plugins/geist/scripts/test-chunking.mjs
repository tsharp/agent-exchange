import "./test-user-env.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { chunkMarkdown } from "../src/rag/chunking.ts";

test("headings isolate topics and preserve source offsets, fences, and frontmatter", () => {
  const source = '---\nkind: fact\n---\n# Guide\n## Database\nUse Postgres.\n\n```md\n# Fake heading\n<!-- section: fake=yes -->\n```\n## Cooking\nBake bread.\n';
  const chunks = chunkMarkdown(source, "Guide");
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[1].headings, ["Guide", "Database"]);
  assert.match(chunks[1].text, /# Fake heading/);
  assert.ok(!chunks[1].text.includes("Cooking"));
  for (const chunk of chunks) assert.equal(source.slice(chunk.start, chunk.end), chunk.text);
  assert.ok(chunks.every((c) => !c.text.includes("kind: fact")));
});

test("structured sections inherit metadata and restore the parent scope", () => {
  const source = '# Guide <!-- category: manual -->\n<!-- section: audience=all; tags=[a, b] -->\nOuter.\n<!-- section: audience=dev -->\n## Child\nInner.\n<!-- /section -->\nOuter again.\n<!-- /section -->\n<!-- tag: example; npc=Keshra -->\nTagged.\n\nPlain.';
  const chunks = chunkMarkdown(source);
  const inner = chunks.find((c) => c.text.includes("Inner."));
  assert.equal(inner.metadata.audience, "dev");
  assert.equal(inner.metadata.tags, "[a, b]");
  assert.equal(inner.metadata.category, "manual");
  assert.equal(chunks.find((c) => c.text.includes("Outer again")).metadata.audience, "all");
  assert.deepEqual(chunks.find((c) => c.text.includes("Outer again")).headings, ["Guide"]);
  assert.equal(chunks.find((c) => c.text.includes("Tagged.")).metadata.npc, "Keshra");
  assert.equal(chunks.find((c) => c.text.includes("Plain.")).metadata.npc, undefined);
});

test("plain Markdown, setext headings, separators, Unicode, and oversized blocks are bounded", () => {
  for (const text of ['a'.repeat(5000), '🧠'.repeat(1500), '```\n' + 'code\n'.repeat(800) + '```', '- item\n'.repeat(400)]) {
    const chunks = chunkMarkdown(text);
    assert.equal(chunks.map((c) => c.text).join(""), text);
    assert.ok(chunks.every((c) => c.text.length <= 800 && !/[\uD800-\uDBFF]$/.test(c.text)));
  }
  assert.deepEqual(chunkMarkdown('Title\n=====\nFirst\n\n***\nSecond').map((c) => c.headings), [["Title"], ["Title"]]);
  assert.deepEqual(chunkMarkdown(''), []);
  assert.deepEqual(chunkMarkdown('---\nkind: fact\n---\n'), []);
});

test("chunk identities survive changes and insertions in unrelated sections", () => {
  const original = '# Guide\n## A\nAlpha\n## B\nBravo';
  const before = chunkMarkdown(original, "Guide").find((c) => c.text.includes("Bravo"));
  const after = chunkMarkdown(original.replace('Alpha', 'Changed\n## New\nNew material'), "Guide").find((c) => c.text.includes("Bravo"));
  assert.equal(before.id, after.id);
  assert.notEqual(before.start, after.start);
  assert.notEqual(before.id, chunkMarkdown(original.replace('Bravo', 'Revised'), "Guide").at(-1).id);
});
