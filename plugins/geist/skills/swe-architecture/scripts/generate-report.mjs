import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { render } from "./report-view.mjs";

// Kept inside each package so either skill works when installed on its own.
const kind = "architecture";
const dimensions = kind === "architecture"
  ? ["Module depth", "Change locality", "Dependency direction", "Boundary ownership", "Testability"]
  : ["Comprehension", "Change locality", "State and failures", "Verification", "Operations and ownership"];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function text(value, name) {
  requireValue(typeof value === "string" && value.trim().length > 0, `${name} must be nonempty text`);
}

function texts(value, name, nonempty = false) {
  requireValue(Array.isArray(value) && (!nonempty || value.length > 0), `${name} must be an array${nonempty ? " with entries" : ""}`);
  value.forEach((entry, index) => text(entry, `${name}[${index}]`));
}

function diagram(value, name) {
  requireValue(value && typeof value === "object", `${name} must be a diagram`);
  texts(value.nodes, `${name}.nodes`, true);
  requireValue(new Set(value.nodes).size === value.nodes.length, `${name} nodes must be unique`);
  requireValue(Array.isArray(value.edges), `${name}.edges must be an array`);
  for (const edge of value.edges) {
    requireValue(Array.isArray(edge) && edge.length === 2 && edge.every(node => value.nodes.includes(node)), `${name} edges must name two existing nodes`);
  }
  text(value.meaning, `${name}.meaning`);
  requireValue(["flow", "layers", "depth", "collapse"].includes(value.layout ?? "flow"), `${name} has an unknown layout`);
  if (["depth", "collapse"].includes(value.layout)) {
    text(value.label, `${name}.label`);
    text(value.interface, `${name}.interface`);
  }
  if (value.emphasis !== undefined) {
    texts(value.emphasis, `${name}.emphasis`);
    requireValue(value.emphasis.every(node => value.nodes.includes(node)), `${name} emphasis must name existing nodes`);
  }
  if (value.problemEdges !== undefined) {
    requireValue(Array.isArray(value.problemEdges), `${name}.problemEdges must be an array`);
    for (const edge of value.problemEdges) {
      requireValue(Array.isArray(edge) && edge.length === 2 && value.edges.some(pair => pair[0] === edge[0] && pair[1] === edge[1]), `${name} problem edges must exist in edges`);
    }
  }
}

function validate(data) {
  requireValue(data?.schemaVersion === 1 && data.kind === kind, `Expected schemaVersion 1 and kind ${kind}`);
  for (const key of ["project", "scope", "revision", "summary", "recommendation"]) text(data[key], key);
  requireValue(["clean", "dirty", "unknown", "not-git"].includes(data.worktree), "Invalid worktree state");
  for (const key of ["inspected", "excluded", "strengths", "limits"]) texts(data[key], key, key === "inspected");
  requireValue(Array.isArray(data.coverage) && data.coverage.length === dimensions.length, "Coverage must account for every evaluation dimension");
  requireValue(new Set(data.coverage.map(item => item.dimension)).size === dimensions.length, "Coverage dimensions must be unique");
  for (const item of data.coverage) {
    requireValue(dimensions.includes(item.dimension), `Unknown dimension: ${item.dimension}`);
    requireValue(["assessed", "unexamined", "inapplicable"].includes(item.status), "Invalid coverage status");
    text(item.reason, "coverage.reason");
  }
  requireValue(Array.isArray(data.findings), "findings must be an array");
  if (data.topFinding !== undefined) requireValue(Number.isInteger(data.topFinding) && data.topFinding >= 0 && data.topFinding < data.findings.length, "topFinding must index an existing finding (zero-based)");
  for (const finding of data.findings) {
    for (const key of ["title", "observation", "consequence", "proposal", "benefits", "tradeoffs", "verification", "decisions"]) text(finding[key], `finding.${key}`);
    requireValue(dimensions.includes(finding.dimension), "Finding must name an evaluation dimension");
    requireValue(data.coverage.some(item => item.dimension === finding.dimension && item.status === "assessed"), "Finding dimension must be assessed");
    requireValue(["Strong", "Worth exploring", "Speculative"].includes(finding.strength), "Invalid recommendation strength");
    requireValue(["observed", "inferred"].includes(finding.basis), "Finding basis must be observed or inferred");
    requireValue(Array.isArray(finding.evidence) && finding.evidence.length > 0, "Finding needs source evidence");
    for (const evidence of finding.evidence) {
      text(evidence.path, "evidence.path");
      text(evidence.detail, "evidence.detail");
      requireValue(Number.isInteger(evidence.line) && evidence.line > 0, "Evidence line must be a positive integer");
    }
    if (finding.wins !== undefined) texts(finding.wins, "finding.wins", true);
    if (finding.dependency !== undefined) {
      requireValue(["in-process", "local-substitutable", "ports & adapters", "mock"].includes(finding.dependency), "Invalid dependency category");
    }
    if (finding.adrConflict !== undefined) text(finding.adrConflict, "finding.adrConflict");
    if (kind === "architecture" || finding.before !== undefined || finding.after !== undefined) {
      diagram(finding.before, "before");
      diagram(finding.after, "after");
    }
  }
}


try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node generate-report.mjs <assessment.json> [new-report.html]\nValidates the assessment and writes an offline HTML report without replacing files.\nDefault output: a unique file in the OS temporary directory. See references/report.md.");
  } else {
    requireValue(args.length >= 1 && args.length <= 2, "Usage: node generate-report.mjs <assessment.json> [new-report.html]");
    const data = JSON.parse(await readFile(resolve(args[0]), "utf8"));
    validate(data);
    const output = args[1] ? resolve(args[1]) : join(tmpdir(), `${kind}-review-${Date.now()}-${randomUUID()}.html`);
    const css = await readFile(new URL("../assets/report.css", import.meta.url), "utf8");
    await writeFile(output, render(data, kind, css), { encoding: "utf8", flag: "wx" });
    console.log(output);
  }
} catch (error) {
  console.error(`Report generation failed: ${error.message}`);
  process.exitCode = 1;
}
