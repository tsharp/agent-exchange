export { storeConfigs, automaticConfig } from "./config.ts";
import { type RagConfig } from "./config.ts";
import { DocumentCache, type Match, type SearchOptions } from "./cache.ts";
import { RecordStore } from "./records.ts";
import type { Embedder } from "./embedding.ts";

export type StoreName = "workspace" | "global";
export type StoreSelection = StoreName | "all";

export async function searchStores(configs: RagConfig[], embedder: Embedder, query: string, options: SearchOptions = {}) {
  configs = [...new Map(configs.map((config) => [config.root, config])).values()];
  const limit = options.limit ?? configs[0]?.topK ?? 3;
  const results = [];
  for (const config of configs) results.push(await new DocumentCache(new RecordStore(config), embedder).search(query, { ...options, limit }));
  const matches: Match[] = results.flatMap((r) => r.matches).sort((a, b) => b.score - a.score ||
    (a.store < b.store ? -1 : a.store > b.store ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : a.start - b.start)).slice(0, limit);
  const refresh = { total: 0, updated: 0, reused: 0, removed: 0, warnings: [] as string[] };
  for (const result of results) {
    for (const key of ["total", "updated", "reused", "removed"] as const) refresh[key] += result.refresh[key];
    refresh.warnings.push(...result.refresh.warnings);
  }
  return { matches, refresh };
}

export async function refreshStores(configs: RagConfig[], embedder: Embedder, rebuild = false) {
  configs = [...new Map(configs.map((config) => [config.root, config])).values()];
  const refresh = { total: 0, updated: 0, reused: 0, removed: 0, warnings: [] as string[] };
  for (const config of configs) {
    const result = (await new DocumentCache(new RecordStore(config), embedder).refresh(rebuild)).refresh;
    for (const key of ["total", "updated", "reused", "removed"] as const) refresh[key] += result[key];
    refresh.warnings.push(...result.warnings.map((warning) => `${config.store}: ${warning}`));
  }
  return refresh;
}
