import { readRagConfig } from "./config.ts";
import { createOnnxEmbedder, prepareModel, MODEL_SIGNATURE } from "./embedding.ts";
import { RecordStore } from "./records.ts";
import { DocumentCache } from "./cache.ts";

const [command, workspace = process.env.GEIST_WORKSPACE_DIR || process.cwd(), ...words] = process.argv.slice(2);
try {
  if (!["prepare", "index", "rebuild", "search", "hook-search"].includes(command)) throw new Error("Usage: run.mjs <prepare|index|rebuild|search> [workspace] [query]");
  if (command === "prepare") await prepareModel();
  const embedder = await createOnnxEmbedder();
  try {
    const config = readRagConfig(workspace);
    const cache = new DocumentCache(new RecordStore(config), embedder);
    let output: object;
    if (command === "prepare") output = { prepared: true, model: MODEL_SIGNATURE };
    else if (command === "search" || command === "hook-search") {
      let query = words.join(" ");
      if (command === "hook-search") {
        let input = "";
        for await (const chunk of process.stdin) { input += chunk; if (input.length > 20000) throw new Error("Query input exceeds limit"); }
        query = (JSON.parse(input) as { query: string }).query;
      }
      output = await cache.search(query);
    } else output = (await cache.refresh(command === "rebuild")).refresh;
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } finally { await embedder.dispose(); }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Geist RAG failed");
  process.exitCode = 1;
}
