import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { validateSurvey } from "./validate-survey.mjs";
import { renderSurvey } from "./report-view.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node generate-report.mjs <survey.json> [new-report.html]\nGenerate an offline Architecture report from structured source evidence.\nDefault output: a unique file in the OS temporary directory. Existing files are not replaced.\nSee references/report.md for the survey schema.");
  } else {
    if (args.length < 1 || args.length > 2) throw new Error("Usage: node generate-report.mjs <survey.json> [new-report.html]");
    const data = JSON.parse(await readFile(resolve(args[0]), "utf8"));
    validateSurvey(data);
    const css = await readFile(new URL("../assets/report.css", import.meta.url), "utf8");
    const output = args[1] ? resolve(args[1]) : join(tmpdir(), `architecture-${Date.now()}-${randomUUID()}.html`);
    await writeFile(output, renderSurvey(data, css), { encoding: "utf8", flag: "wx" });
    console.log(output);
  }
} catch (error) {
  console.error(`Report generation failed: ${error.message}`);
  process.exitCode = 1;
}
