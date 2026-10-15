import { escape, diagram } from "./diagrams.mjs";

const list = entries => entries.length ? `<ul>${entries.map(entry => `<li>${escape(entry)}</li>`).join("")}</ul>` : "<p>None recorded.</p>";
const field = (label, value) => `<div><p class="label">${label}</p><p>${escape(value)}</p></div>`;
const strengthClass = strength => ({ Strong: "strong", "Worth exploring": "explore", Speculative: "speculative" })[strength];

function card(finding, index) {
  const diagrams = finding.before && finding.after
    ? `<div class="comparison">${diagram(finding.before, "before", `before-${index}`)}${diagram(finding.after, "after", `after-${index}`)}</div>` : "";
  return `<article class="candidate" id="finding-${index + 1}"><div class="candidate-head"><span class="number">${String(index + 1).padStart(2, "0")}</span><div class="title-block"><h2>${escape(finding.title)}</h2><div class="badges"><span class="badge ${strengthClass(finding.strength)}">${escape(finding.strength)}</span>${finding.dependency ? `<span class="badge">${escape(finding.dependency)}</span>` : ""}<span class="badge">${escape(finding.dimension)}</span></div><p class="files">${[...new Set(finding.evidence.map(item => item.path))].map(escape).join(" · ")}</p></div></div>
    ${diagrams}<div class="prose-grid">${field("Problem", finding.observation)}${field("Solution · proposed", finding.proposal)}</div>
    ${finding.wins?.length ? `<ul class="wins">${finding.wins.map(win => `<li>${escape(win)}</li>`).join("")}</ul>` : `<ul class="wins"><li>${escape(finding.benefits)}</li></ul>`}
    ${finding.adrConflict ? `<aside class="adr">${escape(finding.adrConflict)}</aside>` : ""}
    <details class="evidence"><summary>Evidence, tradeoffs & verification · ${escape(finding.basis)}</summary><div class="evidence-grid"><div><p class="label">Source evidence</p>${list(finding.evidence.map(item => `${item.path}:${item.line} — ${item.detail}`))}</div>${field("Change scenario", finding.consequence)}${field("Expected benefits", finding.benefits)}${field("Tradeoffs & migration", finding.tradeoffs)}${field("Verification plan", finding.verification)}${field("Existing decisions", finding.decisions)}</div></details></article>`;
}

export function render(data, kind, css) {
  const top = data.findings[data.topFinding ?? 0];
  const partial = data.coverage.some(item => item.status === "unexamined") || data.limits.length > 0;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(data.project)} · ${kind} review</title><style>${css}</style></head><body><main>
    <header class="masthead"><p class="eyebrow">Geist / ${kind} review</p><h1>${escape(data.project)}</h1><div class="meta"><span>${escape(data.scope)}</span><span>${escape(data.revision)} · ${escape(data.worktree)}</span><span>${escape(new Date().toISOString().slice(0, 10))}</span><span>${data.findings.length} ${data.findings.length === 1 ? "candidate" : "candidates"}</span></div>${partial ? '<p class="partial">Partial evidence — read the scope and limits before acting.</p>' : ""}<div class="legend"><span><i class="key"></i>Module</span><span><i class="key boundary"></i>Responsibility boundary</span><span><i class="key leak"></i>Dependency friction</span><span><i class="key deep"></i>Deep module / owner</span></div></header>
    ${data.findings.length ? `<nav class="contents" aria-label="Candidates">${data.findings.map((finding, index) => `<a href="#finding-${index + 1}">${String(index + 1).padStart(2, "0")} / ${escape(finding.title)}</a>`).join("")}</nav>` : ""}
    ${data.findings.map(card).join("") || '<section class="empty"><h2>No change justified yet.</h2><p>No supported improvement candidates were recorded. See coverage and limits before interpreting this result.</p></section>'}
    <section class="recommendation"><p class="eyebrow">Top recommendation</p>${top ? `<h3>${escape(top.title)}</h3>` : ""}<p>${escape(data.recommendation)}</p>${top ? `<a href="#finding-${(data.topFinding ?? 0) + 1}">Explore candidate ${String((data.topFinding ?? 0) + 1).padStart(2, "0")} ↗</a>` : ""}${kind === "architecture" && top ? '<p class="next-step">Which of these would you like to explore?</p>' : ""}</section>
    <details class="coverage"><summary>Assessment, scope & coverage</summary><h3>Assessment</h3><p>${escape(data.summary)}</p><div class="evidence-grid"><div><h3>What to preserve</h3>${list(data.strengths)}</div><div><h3>Limits</h3>${list(data.limits)}</div><div><h3>Inspected</h3>${list(data.inspected)}</div><div><h3>Excluded</h3>${list(data.excluded)}</div></div><table><thead><tr><th>Dimension</th><th>Status</th><th>Evidence / reason</th></tr></thead><tbody>${data.coverage.map(item => `<tr><td>${escape(item.dimension)}</td><td>${escape(item.status)}</td><td>${escape(item.reason)}</td></tr>`).join("")}</tbody></table></details>
    <footer><span>Geist · ${kind} review · evidence before action</span><span>Generated ${escape(new Date().toISOString())} · offline report</span></footer></main></body></html>\n`;
}
