import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: { "hooks/run": "src/hooks/run.ts", "rag/run": "src/rag/cli.ts", "mcp/run": "src/rag/mcp.ts" },
  outdir: resolve(root, "runtime"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["onnxruntime-node"],
  banner: { js: 'import { createRequire as geistCreateRequire } from "node:module"; const require = geistCreateRequire(import.meta.url);' },
  legalComments: "inline",
  write: false,
});
for (const output of result.outputFiles) {
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(output.path, "utf8").replace(/\r\n/g, "\n"), output.text,
      `Bundle is stale: ${output.path}; run npm run build`);
  } else {
    mkdirSync(dirname(output.path), { recursive: true });
    writeFileSync(output.path, output.text);
  }
}
console.log(process.argv.includes("--check") ? "Geist runtime bundles match their source." : "Built Geist hooks, RAG CLI, and MCP server.");
