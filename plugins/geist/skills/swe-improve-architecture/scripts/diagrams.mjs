export const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const list = nodes => nodes.map(node => `<li>${escape(node)}</li>`).join("");

function wrap(label) {
  const words = label.split(/\s+/);
  const lines = [""];
  for (const word of words) {
    if (lines.at(-1).length + word.length > 21 && lines.at(-1)) lines.push("");
    lines[lines.length - 1] += `${lines.at(-1) ? " " : ""}${word}`;
  }
  return lines;
}

function flow(value, id) {
  // Rank acyclic portions by dependencies; retain all nodes when cycles exist.
  const rank = new Map(value.nodes.map(node => [node, 0]));
  const incoming = new Map(value.nodes.map(node => [node, value.edges.filter(edge => edge[1] === node).length]));
  const queue = value.nodes.filter(node => incoming.get(node) === 0);
  for (const node of queue) {
    for (const [, target] of value.edges.filter(edge => edge[0] === node)) {
      rank.set(target, Math.max(rank.get(target), rank.get(node) + 1));
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  const columns = Math.max(...rank.values()) + 1;
  const rows = new Map();
  const positions = new Map(value.nodes.map(node => {
    const column = rank.get(node);
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return [node, { x: 20 + column * 215, y: 35 + row * 102 }];
  }));
  const width = Math.max(420, columns * 215);
  const height = Math.max(280, Math.max(...rows.values()) * 102 + 40);
  const edges = value.edges.map(([from, to], index) => {
    const a = positions.get(from), b = positions.get(to);
    const leak = value.problemEdges?.some(edge => edge[0] === from && edge[1] === to);
    let path;
    if (b.x > a.x) path = `M${a.x + 175},${a.y + 28} C${a.x + 198},${a.y + 28} ${b.x - 25},${b.y + 28} ${b.x - 4},${b.y + 28}`;
    else {
      const lane = Math.max(a.x, b.x) + 192 + index * 3;
      path = `M${a.x + 175},${a.y + 18} C${lane},${a.y - 24} ${lane},${b.y + 70} ${b.x + 175},${b.y + 39}`;
    }
    return `<path d="${path}" fill="none" stroke="${leak ? "#b3483d" : "#8b9b8c"}" stroke-width="1.6" ${leak ? 'stroke-dasharray="5 4"' : ""} marker-end="url(#${id}-${leak ? "red" : "arrow"})"/>`;
  }).join("");
  const nodes = value.nodes.map(node => {
    const { x, y } = positions.get(node);
    const deep = value.emphasis?.includes(node);
    const lines = wrap(node);
    const label = lines.map((line, index) => `<tspan x="${x + 87.5}" dy="${index ? 15 : 0}">${escape(line)}</tspan>`).join("");
    return `<g><title>${escape(node)}</title><rect x="${x}" y="${y}" width="175" height="56" rx="5" fill="${deep ? "#1e473a" : "#ffffff"}" stroke="${deep ? "#1e473a" : "#bac5b8"}"/><text x="${x + 87.5}" y="${y + 31 - (lines.length - 1) * 7}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="${deep ? "#f2f7ed" : "#485b48"}">${label}</text></g>`;
  }).join("");
  const marker = (name, color) => `<marker id="${id}-${name}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(value.meaning)}"><defs>${marker("arrow", "#8b9b8c")}${marker("red", "#b3483d")}</defs>${edges}${nodes}</svg>`;
}

export function diagram(value, state, id) {
  const layout = value.layout ?? "flow";
  let visual;
  if (layout === "layers") {
    visual = `<div class="layers">${value.nodes.map(node => `<div class="layer ${value.emphasis?.includes(node) ? "emphasis" : ""}">${escape(node)}</div>`).join("")}</div>`;
  } else if (layout === "collapse") {
    visual = `<div class="module"><div class="module-title">${escape(value.label)}</div><div class="interface">${escape(value.interface)}</div><div class="internals">${value.nodes.map(node => `<div class="internal">${escape(node)}</div>`).join("")}</div></div>`;
  } else if (layout === "depth") {
    visual = `<div class="depth-view ${state === "after" ? "deep" : ""}"><div class="depth-interface"><div class="label">Interface obligations</div>${escape(value.interface)}</div><div class="depth-implementation"><div class="label">${escape(value.label)}</div><ul>${list(value.nodes)}</ul></div></div>`;
  } else visual = flow(value, id);
  return `<figure class="diagram ${state}"><figcaption>${state === "before" ? "Before" : "After"}<span class="state">${state === "before" ? "Observed structure" : "Proposed structure"}</span></figcaption><div class="visual">${visual}</div><p class="diagram-note">${escape(value.meaning)}</p>${value.edges.length ? `<details class="edge-list"><summary>Dependency details</summary><ul>${list(value.edges.map(([from, to]) => `${from} → ${to}`))}</ul></details>` : ""}</figure>`;
}
