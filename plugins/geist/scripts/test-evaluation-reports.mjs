import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, cp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const skills = fileURLToPath(new URL("../skills/", import.meta.url));
function assessment(kind) {
  const dimensions = kind === "architecture"
    ? ["Module depth", "Change locality", "Dependency direction", "Boundary ownership", "Testability"]
    : ["Comprehension", "Change locality", "State and failures", "Verification", "Operations and ownership"];
  return {
    schemaVersion: 1, kind, project: "Synthetic <script>alert('x')</script>",
    scope: "Order intake", revision: "fixture", worktree: "dirty",
    summary: "Repeated validation spans callers.", inspected: ["src/intake.mjs"],
    excluded: [], strengths: ["Focused persistence adapter."], limits: ["Synthetic inspection only."],
    coverage: dimensions.map(dimension => ({ dimension, status: "assessed", reason: "Inspected fixture path." })),
    findings: [{
      title: "Concentrate validation", dimension: dimensions[0], strength: "Worth exploring", basis: "observed",
      evidence: [{ path: "src/intake.mjs", line: 12, detail: "Callers repeat validation." }],
      observation: "Callers repeat validation order.", consequence: "Rule updates need coordinated edits.",
      proposal: "Move validation into intake.", benefits: "One place to change the rule.",
      tradeoffs: "Preserve caller error contracts.", verification: "Exercise both callers with invalid input.",
      decisions: "No applicable ADR in fixture.",
      before: { nodes: ["Caller", "Validation"], edges: [["Caller", "Validation"]], meaning: "An arrow means calls." },
      after: { nodes: ["Caller", "Intake"], edges: [["Caller", "Intake"]], meaning: "An arrow means calls; validation is internal." },
    }], recommendation: "Explore intake ownership with existing error contracts.",
  };
}

for (const kind of ["maintainability", "architecture"]) {
  test(`${kind}: independent generation, validation, and safe output`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "geist-evaluation-"));
    const generated = [];
    try {
      const installed = join(directory, "skill");
      await cp(join(skills, `swe-improve-${kind}`), installed, { recursive: true });
      const input = join(directory, "assessment.json");
      const output = join(directory, "report with spaces.html");
      const run = (...args) => spawnSync(process.execPath, [join(installed, "scripts/generate-report.mjs"), ...args], { cwd: directory, encoding: "utf8" });
      assert.equal(run("--help").status, 0);
      assert.equal(run().status, 1);
      const data = assessment(kind);
      await writeFile(input, JSON.stringify(data));
      const result = run(input, output);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), output);
      const html = await readFile(output, "utf8");
      assert.ok(html.includes("&lt;script&gt;"));
      assert.ok(!html.includes("<script"));
      assert.ok(!html.includes('src="http'));
      assert.ok(html.includes("src/intake.mjs:12"));
      assert.ok(html.includes("<svg"));
      assert.equal(run(input, output).status, 1);
      assert.equal(await readFile(output, "utf8"), html);
      const mutations = [
        value => { value.findings[0].evidence = []; },
        value => { value.findings[0].evidence[0].line = 0; },
        value => { value.coverage.pop(); },
        value => { value.coverage[1] = value.coverage[0]; },
        value => { value.coverage[0].status = "unexamined"; },
        value => { value.kind = "other"; },
        value => { value.topFinding = 99; },
        value => { value.findings[0].wins = []; },
        value => { value.findings[0].before.layout = "unknown"; },
        value => { value.findings[0].after = undefined; },
        value => { value.findings[0].before.problemEdges = [["Missing", "Intake"]]; },
        value => { value.findings[0].after.layout = "collapse"; },
      ];
      if (kind === "architecture") mutations.push(value => { value.findings[0].after.edges = [["Missing", "Intake"]]; });
      for (const mutate of mutations) {
        const invalid = structuredClone(data);
        mutate(invalid);
        await writeFile(input, JSON.stringify(invalid));
        assert.equal(run(input, join(directory, "invalid.html")).status, 1);
        assert.ok(!(await readdir(directory)).includes("invalid.html"));
      }
      data.findings = [];
      data.recommendation = "No change justified in the inspected scope.";
      data.coverage[0] = { ...data.coverage[0], status: "unexamined", reason: "Evidence unavailable." };
      await writeFile(input, JSON.stringify(data));
      for (let index = 0; index < 2; index++) {
        const empty = run(input);
        assert.equal(empty.status, 0, empty.stderr);
        generated.push(empty.stdout.trim());
        const report = await readFile(generated.at(-1), "utf8");
        assert.ok(report.includes("No supported improvement candidates"));
        assert.ok(report.includes("unexamined"));
      }
      assert.notEqual(generated[0], generated[1]);
      const example = join(installed, "assets/example-assessment.json");
      const visualOutput = join(directory, "visual.html");
      assert.equal(run(example, visualOutput).status, 0);
      const visual = await readFile(visualOutput, "utf8");
      for (const layout of ['class="layers"', 'class="module"', 'class="depth-view deep"']) assert.ok(visual.includes(layout));
      const exampleData = JSON.parse(await readFile(example, "utf8"));
      exampleData.topFinding = 2;
      exampleData.findings[0].adrConflict = '<img src=x onerror="alert(1)">';
      exampleData.findings[0].after.interface = '</div><script>alert(1)</script>';
      exampleData.findings[0].wins = ['<script>bad()</script>'];
      await writeFile(input, JSON.stringify(exampleData));
      const escapedOutput = join(directory, "escaped.html");
      assert.equal(run(input, escapedOutput).status, 0);
      const escaped = await readFile(escapedOutput, "utf8");
      assert.ok(!escaped.includes("<script"));
      assert.ok(!escaped.includes("<img"));
      assert.ok(escaped.includes('href="#finding-3">Explore candidate 03'));
      await writeFile(input, "{broken");
      assert.equal(run(input).status, 1);
    } finally {
      await Promise.all(generated.map(path => rm(path, { force: true })));
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("independent generator copies share the renderer contract", async () => {
  const first = await readFile(join(skills, "swe-improve-maintainability/scripts/generate-report.mjs"), "utf8");
  const second = await readFile(join(skills, "swe-improve-architecture/scripts/generate-report.mjs"), "utf8");
  assert.equal(second, first.replace('const kind = "maintainability";', 'const kind = "architecture";'));
  for (const path of ["scripts/diagrams.mjs", "scripts/report-view.mjs", "assets/report.css"]) {
    assert.equal(await readFile(join(skills, "swe-improve-architecture", path), "utf8"), await readFile(join(skills, "swe-improve-maintainability", path), "utf8"));
  }
});
