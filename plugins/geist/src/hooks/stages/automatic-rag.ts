import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { automaticConfig, type RagConfig } from "../../rag/config.ts";
import type { Match } from "../../rag/cache.ts";
import { appendContext, stringField, type HookStage } from "../pipeline.ts";
import { deliverHints, resetDelivery } from "./rag-delivery.ts";

// Resolved from the shipped runtime/hooks/run.mjs bundle.
const WORKER = fileURLToPath(new URL("../rag/run.mjs", import.meta.url));

export function queryWorker(config: RagConfig, query: string, worker = WORKER): Promise<Match[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, "hook-search", config.workspace], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "", bytes = 0, done = false;
    const finish = (error?: Error, matches: Match[] = []) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(matches);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error("retrieval timed out")); }, config.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 128 * 1024) { child.kill(); finish(new Error("retrieval output exceeded limit")); }
      else output += chunk;
    });
    child.stderr.resume();
    child.on("error", (error) => finish(error));
    child.stdin.on("error", () => { /* Child failure is reported by error/close. */ });
    child.on("close", (code) => {
      if (code !== 0) { finish(new Error("retrieval unavailable; run the RAG prepare/index commands")); return; }
      try {
        const result = JSON.parse(output) as { matches: Match[] };
        if (!Array.isArray(result.matches)) throw new Error("invalid retrieval result");
        finish(undefined, result.matches);
      } catch { finish(new Error("invalid retrieval output")); }
    });
    child.stdin.end(JSON.stringify({ query }));
  });
}

export const automaticRag: HookStage = {
  name: "automatic-rag",
  async run(request, response) {
    if (!["UserPromptSubmit", "SessionStart", "SessionEnd", "PreCompact"].includes(request.event)) return;
    try {
      const config = automaticConfig(request.workspace);
      if (!config.enabled) return;
      if (request.event !== "UserPromptSubmit") {
        if (request.event !== "SessionStart" || request.input.source !== "resume") await resetDelivery(config, request);
        return;
      }
      const query = stringField(request.input, "prompt", "user_prompt", "userPrompt");
      if (!query?.trim()) return;
      if (request.host === "copilot" && !stringField(request.input, "transformedPrompt")) return;
      const matches = await queryWorker(config, query.slice(0, 4000));
      appendContext(response, await deliverHints(config, request, matches));
    } catch (error) {
      console.error(`Geist RAG skipped: ${error instanceof Error ? error.message : "retrieval failed"}`);
    }
  },
};
