import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { MODEL_DIRECTORY, createOnnxEmbedder } from "./embedding.ts";
import { RagError } from "./config.ts";

async function verify() {
  const embedder = await createOnnxEmbedder();
  try {
    const [vector] = await embedder.embed(["Geist runtime verification"]);
    if (!vector.length || !vector.every(Number.isFinite) || !vector.some((value) => value !== 0)) {
      throw new RagError("model_unavailable", "ONNX verification returned an invalid embedding.");
    }
    return { prepared: true, model: embedder.signature, dimensions: vector.length };
  } finally { await embedder.dispose(); }
}

// Explicit setup only. Keep installer output off the MCP protocol's stdout.
export async function prepareRuntime(workspace: string) {
  try { return await verify(); } catch { /* A fresh installation needs setup. */ }
  await new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, [resolve(MODEL_DIRECTORY, "../scripts/setup-rag.mjs")], {
      cwd: workspace, stdio: ["ignore", "ignore", "pipe"], windowsHide: true, timeout: 300_000,
    });
    let diagnostic = "";
    child.stderr.on("data", (chunk) => { diagnostic = (diagnostic + chunk).slice(-2000); });
    child.on("error", () => reject(new RagError("model_unavailable", "Could not start ONNX setup. Check Node.js and the installed Geist files.")));
    child.on("close", (code) => code === 0 ? done() : reject(new RagError("model_unavailable",
      `ONNX setup failed. Check npm, network access, and plugin directory permissions. ${diagnostic.trim()}`)));
  });
  return verify();
}
