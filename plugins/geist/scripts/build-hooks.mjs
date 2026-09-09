import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "runtime/hooks/run.mjs");
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/hooks/run.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "inline",
  write: false,
});
const bundle = result.outputFiles[0].text;
if (process.argv.includes("--check")) {
  assert.equal(readFileSync(output, "utf8").replace(/\r\n/g, "\n"), bundle,
    "Hook bundle is stale; run npm run build and include runtime/hooks/run.mjs");
  console.log("Hook bundle matches its source.");
} else {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bundle);
  console.log("Built standalone Geist hooks with runtime dependencies included.");
}
