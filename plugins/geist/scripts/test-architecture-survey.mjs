import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, cp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateSurvey } from "../skills/swe-architecture/scripts/validate-survey.mjs";

const skill = fileURLToPath(new URL("../skills/swe-architecture/", import.meta.url));
const example = async () => JSON.parse(await readFile(join(skill, "assets/example-survey.json"), "utf8"));

test("survey preserves scoped domain language and rejects unresolved references", async () => {
  const data = await example();
  assert.doesNotThrow(() => validateSurvey(data));
  assert.equal(data.glossary.filter(term => term.term === "Order").length, 2);
  for (const mutate of [
    value => { value.kind = "architecture"; },
    value => { value.coverage.pop(); },
    value => { value.coverage[0] = value.coverage[1]; },
    value => { value.domains[0].evidence = []; },
    value => { value.domains[0].basis = "confirmed"; },
    value => { value.components[0].domainIds = ["missing"]; },
    value => { value.components[0].layer = "missing"; },
    value => { value.dependencies[0].to = "missing"; },
    value => { value.domainRelations[0].from = "missing"; },
    value => { value.glossary[0].domainId = "missing"; },
    value => { value.glossary[0].status = "certain"; },
    value => { value.glossary.push(value.glossary[0]); },
    value => { value.ambiguities[0].contexts = ["missing"]; },
    value => { value.layers[0].allowedDependencies = ["missing"]; },
    value => { value.views[0].diagram.edges = [["Missing", "Ordering"]]; },
    value => { value.decisions[0].evidence[0].line = 0; },
    value => { value.coverage.find(item => item.dimension === "Domains and terminology").status = "unexamined"; },
  ]) {
    const invalid = structuredClone(data); mutate(invalid);
    assert.throws(() => validateSurvey(invalid));
  }
});

test("survey generates independently with escaping, scoped boundaries, and no overwrite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "geist-survey-"));
  try {
    const installed = join(directory, "skill"); await cp(skill, installed, { recursive: true });
    const input = join(directory, "survey.json"), output = join(directory, "Architecture report.html");
    const run = (...args) => spawnSync(process.execPath, [join(installed, "scripts/generate-report.mjs"), ...args], { cwd: directory, encoding: "utf8" });
    assert.equal(run("--help").status, 0); assert.equal(run().status, 1);
    const data = await example();
    data.scopeType = "section"; data.scope = "Ordering with Fulfillment outside scope";
    const worker = data.components.find(item => item.id === "worker");
    data.components = data.components.filter(item => item.id !== "worker");
    data.externals.push({ id: worker.id, name: worker.name, role: "Fulfillment is outside the Ordering section and consumes its acceptance event.", basis: worker.basis, evidence: worker.evidence });
    data.project = '<script>alert("project")</script>';
    data.glossary[0].definition = '<img src="x" onerror="alert(1)">';
    await writeFile(input, JSON.stringify(data));
    const result = run(input, output); assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), output);
    const html = await readFile(output, "utf8");
    assert.ok(!html.includes("<script")); assert.ok(!html.includes("<img"));
    assert.ok(html.includes("&lt;script&gt;")); assert.ok(html.includes("External to scope"));
    assert.ok(html.includes("Fulfillment is outside the Ordering section"));
    assert.ok(!html.includes('id="component-worker"'));
    assert.ok(html.includes("Domain language")); assert.ok(html.includes("Ambiguities & contradictions"));
    assert.ok(!html.includes("Before")); assert.ok(!html.includes("Top recommendation"));
    assert.equal(run(input, output).status, 1); assert.equal(await readFile(output, "utf8"), html);
    data.dependencies[0].to = "missing"; await writeFile(input, JSON.stringify(data));
    assert.equal(run(input, join(directory, "invalid.html")).status, 1);
    assert.ok(!(await readdir(directory)).includes("invalid.html"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("survey delivers partial evidence without inventing domains, diagrams, or glossary", async () => {
  const data = await example();
  for (const key of ["domains", "domainRelations", "components", "externals", "dependencies", "layers", "views", "flows", "glossary", "ambiguities", "decisions"]) data[key] = [];
  data.limits = ["Only manifests were available; source could not be examined."];
  data.coverage.forEach(item => { item.status = "unexamined"; item.reason = "Source unavailable."; });
  assert.doesNotThrow(() => validateSurvey(data));
  const directory = await mkdtemp(join(tmpdir(), "geist-partial-survey-"));
  let generated;
  try {
    const input = join(directory, "partial.json"); await writeFile(input, JSON.stringify(data));
    const result = spawnSync(process.execPath, [join(skill, "scripts/generate-report.mjs"), input], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr); generated = result.stdout.trim();
    const html = await readFile(generated, "utf8");
    assert.ok(html.includes("Partial evidence")); assert.ok(html.includes("unexamined"));
    assert.ok(!html.includes("<svg"));
    data.limits = []; assert.throws(() => validateSurvey(data));
  } finally {
    if (generated) await rm(generated, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});
