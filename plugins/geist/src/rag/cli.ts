import { initializeUserData } from "./config.ts";
import { storeConfigs, automaticConfig, searchStores, refreshStores } from "./library.ts";
import { createOnnxEmbedder, prepareModel, MODEL_SIGNATURE } from "./embedding.ts";

const [command, workspace = process.env.GEIST_WORKSPACE_DIR || process.cwd(), ...words] = process.argv.slice(2);
try {
  if (!["prepare", "index", "rebuild", "search", "hook-search"].includes(command)) throw new Error("Usage: run.mjs <prepare|index|rebuild|search> [workspace] [query]");
  if (command === "prepare") await prepareModel();
  const embedder = await createOnnxEmbedder();
  try {
    initializeUserData();
    const storeFlag = words.indexOf("--store");
    const selection = storeFlag >= 0 ? words.splice(storeFlag, 2)[1] : "all";
    if (!["workspace", "global", "all"].includes(selection)) throw new Error("--store must be workspace, global, or all");
    const configs = storeConfigs(workspace).filter((config) => selection === "all" || config.store === selection);
    let output: object;
    if (command === "prepare") output = { prepared: true, model: MODEL_SIGNATURE };
    else if (command === "search" || command === "hook-search") {
      let query = words.join(" ");
      if (command === "hook-search") {
        let input = "";
        for await (const chunk of process.stdin) { input += chunk; if (input.length > 20000) throw new Error("Query input exceeds limit"); }
        query = (JSON.parse(input) as { query: string }).query;
      }
      output = await searchStores(command === "hook-search" ? configs.filter((config) => config.enabled) : configs, embedder, query, { limit: command === "hook-search" ? automaticConfig(workspace).topK : configs[0]?.topK });
    } else output = await refreshStores(configs, embedder, command === "rebuild");
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } finally { await embedder.dispose(); }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Geist RAG failed");
  process.exitCode = 1;
}
