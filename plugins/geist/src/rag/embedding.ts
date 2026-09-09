import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { Tokenizer } from "@huggingface/tokenizers";
import { RagError } from "./config.ts";
import { atomicWrite } from "./files.ts";

export const MODEL = "Xenova/all-MiniLM-L6-v2";
export const REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
export const MODEL_SIGNATURE = `${MODEL}@${REVISION}:q8:mean:normalized:tokenizers-0.2`;
export const MODEL_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "../../models");
export type Embedder = { signature: string; embed(texts: string[]): Promise<number[][]> };

export async function prepareModel(): Promise<void> {
  mkdirSync(MODEL_DIRECTORY, { recursive: true });
  for (const file of ["tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]) {
    const target = resolve(MODEL_DIRECTORY, file);
    if (existsSync(target)) continue;
    const response = await fetch(`https://huggingface.co/${MODEL}/resolve/${REVISION}/${file}`, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new RagError("model_unavailable", `Model download failed: HTTP ${response.status}`);
    mkdirSync(dirname(target), { recursive: true });
    const bytes = Buffer.from(await response.arrayBuffer());
    atomicWrite(target, bytes);
  }
}

export async function createOnnxEmbedder(): Promise<Embedder & { dispose(): Promise<void> }> {
  try {
    const { InferenceSession, Tensor } = await import("onnxruntime-node");
    const tokenizer = new Tokenizer(JSON.parse(readFileSync(resolve(MODEL_DIRECTORY, "tokenizer.json"), "utf8")),
      JSON.parse(readFileSync(resolve(MODEL_DIRECTORY, "tokenizer_config.json"), "utf8")));
    const session = await InferenceSession.create(resolve(MODEL_DIRECTORY, "onnx/model_quantized.onnx"), {
      executionProviders: ["cpu"], intraOpNumThreads: 2, interOpNumThreads: 1,
    });
    return {
      signature: MODEL_SIGNATURE,
      async embed(texts) {
        const vectors: number[][] = [];
        for (const text of texts) {
          const encoded = tokenizer.encode(text, { add_special_tokens: true });
          const ids = encoded.ids.length > 512 ? [...encoded.ids.slice(0, 511), encoded.ids.at(-1)!] : encoded.ids;
          const feeds: Record<string, InstanceType<typeof Tensor>> = {
            input_ids: new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
            attention_mask: new Tensor("int64", BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]),
          };
          if (session.inputNames.includes("token_type_ids")) feeds.token_type_ids = new Tensor("int64", new BigInt64Array(ids.length), [1, ids.length]);
          const output = await session.run(feeds);
          const hidden = output.last_hidden_state;
          const dimensions = hidden.dims[2];
          const vector = Array<number>(dimensions).fill(0);
          for (let token = 0; token < ids.length; token++) {
            for (let dimension = 0; dimension < dimensions; dimension++) {
              vector[dimension] += Number(hidden.data[token * dimensions + dimension]) / ids.length;
            }
          }
          const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
          vectors.push(vector.map((value) => norm ? value / norm : 0));
        }
        return vectors;
      },
      async dispose() { await session.release(); },
    };
  } catch {
    throw new RagError("model_unavailable", "Local ONNX model/runtime is unavailable. Run the Geist RAG setup and prepare commands first.");
  }
}
