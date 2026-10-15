import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function scalar(value) {
  if (value.startsWith('"')) {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "string") throw new Error("expected a string");
    return parsed;
  }
  if (value.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(value)) throw new Error("invalid single-quoted string");
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (/^[>|\[\]{}&*!#%?@`]/.test(value) || /^-\s/.test(value) || /(?:^|\s)#|:\s/.test(value)) {
    throw new Error("unsupported scalar syntax; use a quoted single-line string");
  }
  return value;
}

// Deliberately supports only mappings with single-line string values, not full YAML.
function mapping(text, path, failures) {
  const result = Object.create(null);
  let section;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^( {2})?([a-z][a-z0-9_-]*):(?: +(.*))?$/.exec(line);
    if (!match) {
      failures.push({ path, message: `unsupported YAML line ${index + 1}: ${line}` });
      continue;
    }
    const [, nested, key, raw] = match;
    const target = nested ? section : result;
    if (!target) {
      failures.push({ path, message: `unexpected nested YAML field '${key}'` });
      continue;
    }
    if (Object.hasOwn(target, key)) {
      failures.push({ path, message: `duplicate YAML field '${key}'` });
      continue;
    }
    if (!nested) section = undefined;
    try {
      if (raw?.trim()) target[key] = scalar(raw.trim());
      else if (!nested) section = target[key] = Object.create(null);
      else throw new Error("nested values must be non-empty single-line strings");
    } catch (error) {
      failures.push({ path, message: `invalid YAML field '${key}': ${error.message}` });
    }
  }
  return result;
}

export async function readSkill(path) {
  const text = await readFile(path, "utf8");
  const failures = [];
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  let data = Object.create(null);
  if (match) data = mapping(match[1], path, failures);
  else failures.push({ path, message: "missing YAML frontmatter" });

  const displayPath = join(dirname(path), "agents", "openai.yaml");
  let display = Object.create(null);
  try {
    const parsed = mapping(await readFile(displayPath, "utf8"), displayPath, failures);
    if (!parsed.interface || typeof parsed.interface !== "object") {
      failures.push({ path: displayPath, message: "interface must be a mapping" });
    } else display = parsed.interface;
  } catch (error) {
    failures.push({ path: displayPath, message: `could not read display metadata (${error.message})` });
  }
  const body = match ? text.slice(match[0].length) : text;
  return {
    data,
    display,
    displayPath,
    headings: new Set([...body.matchAll(/^## (.+)\r?$/gm)].map((match) => match[1])),
    links: [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]),
    failures,
  };
}
