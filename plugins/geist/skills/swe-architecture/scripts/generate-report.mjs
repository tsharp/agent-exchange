import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

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
    if (kind === "architecture") {
      diagram(finding.before, "before");
      diagram(finding.after, "after");
    }
  }
}

const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const list = entries => entries.length ? `<ul>${entries.map(entry => `<li>${escape(entry)}</li>`).join("")}</ul>` : "<p>None recorded.</p>";
const section = (title, value) => `<h3>${escape(title)}</h3><p>${escape(value)}</p>`;

function graph(value, title) {
  const width = 560;
  const height = value.nodes.length * 66 + 20;
  const positions = new Map(value.nodes.map((node, index) => [node, 20 + index * 66]));
  const edges = value.edges.map(([from, to]) => {
    const start = positions.get(from) + 18;
    const end = positions.get(to) + 18;
    return `<path d="M 440 ${start} C 540 ${start}, 540 ${end}, 448 ${end}" fill="none" stroke="#6b7280" stroke-width="2"/><polygon points="440,${end} 450,${end - 5} 450,${end + 5}" fill="#6b7280"/>`;
  }).join("");
  const nodes = value.nodes.map(node => `<rect x="12" y="${positions.get(node)}" width="428" height="38" rx="6" fill="#e8eef5"/><text x="24" y="${positions.get(node) + 25}" font-size="14">${escape(node)}</text>`).join("");
  return `<figure><figcaption>${escape(title)}</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title>${edges}${nodes}</svg><p>${escape(value.meaning)}</p>${list(value.edges.map(([from, to]) => `${from} → ${to}`))}</figure>`;
}

function render(data) {
  const cards = data.findings.map((finding, index) => `<article id="finding-${index + 1}">
    <h2>${index + 1}. ${escape(finding.title)}</h2>
    <p class="badge">${escape(finding.strength)} · ${escape(finding.dimension)} · ${escape(finding.basis)}</p>
    <h3>Evidence</h3>${list(finding.evidence.map(item => `${item.path}:${item.line} — ${item.detail}`))}
    ${section("Observation", finding.observation)}${section("Consequence", finding.consequence)}
    ${kind === "architecture" ? `<div class="diagrams">${graph(finding.before, "Before: observed structure")}${graph(finding.after, "After: proposed structure")}</div>` : ""}
    ${section("Proposal", finding.proposal)}${section("Benefits", finding.benefits)}
    ${section("Tradeoffs and migration", finding.tradeoffs)}${section("Verification plan", finding.verification)}
    ${section("Existing decisions", finding.decisions)}</article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <title>${escape(data.project)}: ${kind} evaluation</title>
    <style>body{font:16px/1.6 system-ui,sans-serif;color:#172638;background:#f3f5f7;margin:0}main{max-width:1100px;margin:auto;padding:32px}article,section,header{background:white;padding:24px;margin:0 0 24px;border:1px solid #d5dce3;border-radius:10px}h1,h2,h3{line-height:1.3}h3{font-size:1rem;margin-bottom:4px}p{white-space:pre-wrap;overflow-wrap:anywhere}.badge{color:#315b76;font-weight:600}.diagrams{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}figure{margin:0;min-width:0}figcaption{font-weight:600}svg{width:100%;height:auto}li{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:8px}@media(max-width:720px){.diagrams{grid-template-columns:1fr}main{padding:12px}}@media print{body{background:white}article{break-inside:avoid}}</style></head>
    <body><main><header><h1>${escape(data.project)}: ${kind} evaluation</h1>
    <p>${escape(data.summary)}</p>${section("Scope", data.scope)}
    <p>Revision: ${escape(data.revision)} · Worktree: ${escape(data.worktree)}</p>
    <p>Generated: ${escape(new Date().toISOString())}</p></header>
    <section><h2>Evidence and coverage</h2><h3>Inspected</h3>${list(data.inspected)}
    <h3>Excluded</h3>${list(data.excluded)}<h3>Limits</h3>${list(data.limits)}
    <table><thead><tr><th>Dimension</th><th>Status</th><th>Reason</th></tr></thead><tbody>
    ${data.coverage.map(item => `<tr><td>${escape(item.dimension)}</td><td>${escape(item.status)}</td><td>${escape(item.reason)}</td></tr>`).join("")}</tbody></table></section>
    <section><h2>What to preserve</h2>${list(data.strengths)}</section>
    ${cards || "<section><h2>Findings</h2><p>No supported improvement candidates were recorded. See coverage and limits before interpreting this result.</p></section>"}
    <section><h2>Top recommendation</h2><p>${escape(data.recommendation)}</p></section></main></body></html>\n`;
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
    await writeFile(output, render(data), { encoding: "utf8", flag: "wx" });
    console.log(output);
  }
} catch (error) {
  console.error(`Report generation failed: ${error.message}`);
  process.exitCode = 1;
}
