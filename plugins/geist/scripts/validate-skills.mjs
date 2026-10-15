import { existsSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkill } from "./skill-metadata.mjs";

export async function validateSkills(root) {
  const failures = [];
  const fail = (path, message) => failures.push(`${relative(root, path)}: ${message}`);
  const skills = join(root, "skills");
  const names = new Set();
  for (const entry of readdirSync(skills, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(skills, entry.name, "SKILL.md");
    if (!existsSync(path)) { fail(path, "each skills/ child directory must be an immediate skill"); continue; }
    const { data, display, displayPath, headings, links, failures: parsing } = await readSkill(path);
    for (const error of parsing) fail(error.path, error.message);
    if (data.name !== entry.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name) || data.name.length > 64) fail(path, "name must match its directory and use lowercase hyphenated words");
    if (names.has(data.name)) fail(path, "duplicate skill name");
    names.add(data.name);
    if (typeof data.description !== "string" || !data.description.length || data.description.length > 1024) fail(path, "description must contain 1 to 1024 characters");
    for (const field of Object.keys(data)) if (!["name", "description", "metadata"].includes(field)) fail(path, `unsupported field: ${field}`);
    if (!/^\d+\.\d+\.\d+$/.test(data.metadata?.version ?? "")) fail(path, "metadata.version must be a stable semantic version");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.metadata?.updated ?? "")) fail(path, "metadata.updated must use YYYY-MM-DD");
    if (!["stable", "draft"].includes(data.metadata?.status)) fail(path, "metadata.status must be stable or draft");
    const sections = ["Overview", "Completion checks"];
    if (entry.name === "swe-init") sections.push("Steps", "Examples");
    for (const heading of sections) if (!headings.has(heading)) fail(path, `missing section: ${heading}`);
    for (const field of ["display_name", "short_description"]) if (typeof display[field] !== "string" || !display[field].trim()) fail(displayPath, `missing interface.${field}`);
    for (const link of links) {
      const target = link.split("#", 1)[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const resolved = resolve(dirname(path), target);
      const fromSkill = relative(dirname(path), resolved);
      if (fromSkill === ".." || fromSkill.startsWith(`..${sep}`) || isAbsolute(fromSkill)) fail(path, `link escapes independent skill: ${target}`);
      else if (!existsSync(resolved)) fail(path, `missing link: ${target}`);
    }
  }
  if (!names.size) failures.push("No skills found");
  return { failures, skillCount: names.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateSkills(fileURLToPath(new URL("../", import.meta.url)));
  if (result.failures.length) { console.error(result.failures.join("\n")); process.exitCode = 1; }
  else console.log(`Validated ${result.skillCount} independently installable Geist skills.`);
}
