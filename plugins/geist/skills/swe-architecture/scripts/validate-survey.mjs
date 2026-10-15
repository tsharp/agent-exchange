const dimensions = ["System context", "Domains and terminology", "Components and layers", "Dependencies", "Runtime flows", "Decisions"];
const fail = message => { throw new Error(message); };
const need = (condition, message) => { if (!condition) fail(message); };
const text = (value, name) => need(typeof value === "string" && value.trim().length > 0, `${name} must be nonempty text`);
const array = (value, name) => need(Array.isArray(value), `${name} must be an array`);
const texts = (value, name) => { array(value, name); value.forEach(item => text(item, name)); };

function evidence(value, name) {
  array(value, `${name}.evidence`);
  need(value.length > 0, `${name} needs source evidence`);
  for (const item of value) {
    text(item.path, "evidence.path"); text(item.detail, "evidence.detail");
    need(Number.isInteger(item.line) && item.line > 0, "evidence.line must be a positive integer");
  }
}

function based(item, name) {
  need(["observed", "inferred"].includes(item.basis), `${name}.basis must be observed or inferred`);
  evidence(item.evidence, name);
}

function ids(items, name) {
  items.forEach(item => need(typeof item.id === "string" && /^[a-z][a-z0-9-]*$/.test(item.id), `${name} needs lowercase hyphenated IDs`));
  const result = new Set(items.map(item => item.id));
  need(result.size === items.length, `${name} IDs must be unique`);
  return result;
}

function graph(value) {
  need(value && typeof value === "object", "view.diagram must be an object");
  texts(value.nodes, "diagram.nodes");
  need(value.nodes.length > 0 && new Set(value.nodes).size === value.nodes.length, "diagram nodes must be nonempty and unique");
  array(value.edges, "diagram.edges"); text(value.meaning, "diagram.meaning");
  need(value.layout === undefined || value.layout === "flow" || value.layout === "layers", "Survey diagrams use flow or layers layouts");
  for (const edge of value.edges) need(Array.isArray(edge) && edge.length === 2 && edge.every(node => value.nodes.includes(node)), "Diagram edges must name existing nodes");
  if (value.emphasis !== undefined) {
    texts(value.emphasis, "diagram.emphasis");
    need(value.emphasis.every(node => value.nodes.includes(node)), "Diagram emphasis must name existing nodes");
  }
  if (value.problemEdges !== undefined) {
    array(value.problemEdges, "diagram.problemEdges");
    for (const edge of value.problemEdges) need(Array.isArray(edge) && edge.length === 2 && value.edges.some(pair => pair[0] === edge[0] && pair[1] === edge[1]), "Diagram problem edges must exist");
  }
}

export function validateSurvey(data) {
  need(data?.schemaVersion === 1 && data.kind === "architecture-survey", "Expected schemaVersion 1 and kind architecture-survey");
  for (const key of ["project", "scope", "revision", "purpose", "summary"]) text(data[key], key);
  need(["repository", "section"].includes(data.scopeType), "scopeType must be repository or section");
  need(["clean", "dirty", "unknown", "not-git"].includes(data.worktree), "Invalid worktree state");
  for (const key of ["inspected", "excluded", "limits", "questions"]) texts(data[key], key);
  need(data.inspected.length > 0, "inspected needs entries");
  for (const key of ["coverage", "domains", "domainRelations", "components", "externals", "dependencies", "layers", "views", "flows", "glossary", "ambiguities", "decisions"]) array(data[key], key);
  need(data.coverage.length === dimensions.length && new Set(data.coverage.map(item => item.dimension)).size === dimensions.length, "Coverage must account for every dimension exactly once");
  for (const item of data.coverage) {
    need(dimensions.includes(item.dimension) && ["assessed", "unexamined", "inapplicable"].includes(item.status), "Invalid coverage dimension or status");
    text(item.reason, "coverage.reason");
  }
  const domainIds = ids(data.domains, "domains");
  const componentIds = ids(data.components, "components");
  const externalIds = ids(data.externals, "externals");
  need([...externalIds].every(id => !componentIds.has(id)), "Component and external IDs must be distinct");
  const endpoints = new Set([...componentIds, ...externalIds]);
  for (const domain of data.domains) {
    text(domain.name, "domain.name"); text(domain.responsibility, "domain.responsibility"); texts(domain.paths, "domain.paths");
    need(["business", "technical", "supporting"].includes(domain.classification), "Invalid domain classification"); based(domain, "domain");
  }
  for (const relation of data.domainRelations) {
    need(domainIds.has(relation.from) && domainIds.has(relation.to), "Domain relationship references an unknown domain");
    text(relation.relationship, "domain relationship"); based(relation, "domain relationship");
  }
  const layerNames = new Set(data.layers.map(layer => layer.name));
  need(layerNames.size === data.layers.length, "Layer names must be unique");
  for (const layer of data.layers) {
    for (const key of ["name", "responsibility", "enforcement"]) text(layer[key], `layer.${key}`);
    texts(layer.allowedDependencies, "layer.allowedDependencies");
    need(layer.allowedDependencies.every(name => layerNames.has(name)), "Allowed dependencies must name declared layers"); based(layer, "layer");
  }
  for (const item of data.components) {
    for (const key of ["name", "responsibility", "layer"]) text(item[key], `component.${key}`);
    need(layerNames.has(item.layer) || item.layer === "unknown", "Component must name a declared layer or unknown");
    for (const key of ["domainIds", "paths", "interfaces", "data"]) texts(item[key], `component.${key}`);
    need(item.domainIds.every(id => domainIds.has(id)), "Component references an unknown domain"); based(item, "component");
  }
  for (const item of data.externals) { text(item.name, "external.name"); text(item.role, "external.role"); based(item, "external"); }
  for (const item of data.dependencies) {
    need(endpoints.has(item.from) && endpoints.has(item.to), "Dependency references an unknown component or external");
    need(["compile", "runtime", "data", "event"].includes(item.kind), "Invalid dependency kind");
    text(item.relationship, "dependency.relationship"); based(item, "dependency");
  }
  for (const view of [...data.views, ...data.flows]) {
    text(view.title, "view.title"); text(view.description, "view.description"); graph(view.diagram); based(view, "view");
  }
  const termKeys = new Set();
  for (const term of data.glossary) {
    for (const key of ["term", "definition"]) text(term[key], `glossary.${key}`);
    need(domainIds.has(term.domainId), "Glossary references an unknown domain");
    need(["established", "inferred", "proposed"].includes(term.status), "Invalid terminology status");
    texts(term.aliases, "term.aliases"); texts(term.codeNames, "term.codeNames"); evidence(term.evidence, "term");
    const key = `${term.domainId}:${term.term.toLowerCase()}`;
    need(!termKeys.has(key), "Duplicate term within a domain"); termKeys.add(key);
  }
  for (const item of data.ambiguities) {
    for (const key of ["term", "description", "question"]) text(item[key], `ambiguity.${key}`);
    texts(item.contexts, "ambiguity.contexts"); need(item.contexts.every(id => domainIds.has(id)), "Ambiguity references an unknown domain"); evidence(item.evidence, "ambiguity");
  }
  for (const item of data.decisions) {
    for (const key of ["title", "decision", "consequence"]) text(item[key], `decision.${key}`);
    need(["documented", "observed", "proposed"].includes(item.status), "Invalid decision status"); evidence(item.evidence, "decision");
  }
  const assessed = name => data.coverage.find(item => item.dimension === name).status === "assessed";
  for (const [dimension, items] of [["Domains and terminology", [...data.domains, ...data.glossary, ...data.domainRelations, ...data.ambiguities]], ["Components and layers", [...data.components, ...data.layers]], ["Dependencies", data.dependencies], ["Runtime flows", data.flows], ["Decisions", data.decisions]]) {
    need(!items.length || assessed(dimension), `${dimension} contains evidence but is not assessed`);
  }
  need(data.views.length > 0 || data.limits.length > 0, "A survey needs architecture diagrams or an explicit evidence limit");
}
