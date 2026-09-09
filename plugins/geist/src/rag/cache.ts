import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { RagError, safePath } from "./config.ts";
import { atomicWrite, withLock } from "./files.ts";
import { RecordStore, matches, type Filters, type RecordData } from "./records.ts";
import type { Embedder } from "./embedding.ts";

const FORMAT = "geist-document-cache-v1:chars1000:overlap150";
type Entry = { record: RecordData; chunks: string[]; vectors: number[][] };
type Snapshot = { format: string; model: string; root: string; entries: Entry[] };
export type Refresh = { total: number; updated: number; reused: number; removed: number; warnings: string[] };
export type SearchOptions = Filters & { limit?: number; include_inactive?: boolean };
export type Match = { id: string; version: string; title: string; path: string; score: number; excerpt: string };

export function chunksFor(record: RecordData): string[] {
  const text = record.body.trim();
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += 850) {
    chunks.push(`${record.title}\n${text.slice(start, start + 1000)}`);
    if (start + 1000 >= text.length) break;
  }
  return chunks.length ? chunks : [record.title];
}

function validVectors(value: unknown, count: number): value is number[][] {
  return Array.isArray(value) && value.length === count && value.every((vector) => Array.isArray(vector) &&
    vector.length > 0 && vector.length === value[0].length && vector.every((number) => typeof number === "number" && Number.isFinite(number)));
}

export class DocumentCache {
  store: RecordStore;
  embedder: Embedder;
  constructor(store: RecordStore, embedder: Embedder) { this.store = store; this.embedder = embedder; }
  async refresh(rebuild = false): Promise<{ entries: Entry[]; refresh: Refresh }> {
    const config = this.store.config;
    return withLock(config, "index", async () => {
      const path = safePath(config.workspace, join(config.cacheDirectory, "documents.json"));
      let previous: Entry[] = [];
      let compatible = false;
      if (!rebuild && existsSync(path)) {
        try {
          const saved = JSON.parse(readFileSync(path, "utf8")) as Snapshot;
          if (saved.format === FORMAT && saved.model === this.embedder.signature && saved.root === config.root && Array.isArray(saved.entries)) {
            previous = saved.entries;
            compatible = true;
          }
        } catch { /* Recreate corrupt derived data from the source records. */ }
      }
      const old = new Map(previous.filter((entry) => entry?.record?.id).map((entry) => [entry.record.id, entry]));
      const { records, warnings } = this.store.scan();
      const entries: Entry[] = [];
      let updated = 0, reused = 0;
      for (const record of records) {
        const chunks = chunksFor(record);
        const cached = old.get(record.id);
        if (cached?.record.version === record.version && JSON.stringify(cached.chunks) === JSON.stringify(chunks) && validVectors(cached.vectors, chunks.length)) {
          entries.push({ record, chunks, vectors: cached.vectors });
          reused++;
        } else {
          const vectors = await this.embedder.embed(chunks);
          if (!validVectors(vectors, chunks.length)) throw new RagError("model_unavailable", "Embedding model returned invalid vectors");
          entries.push({ record, chunks, vectors });
          updated++;
        }
      }
      const ids = new Set(records.map((record) => record.id));
      const removed = [...old.keys()].filter((id) => !ids.has(id)).length;
      // Recheck the source snapshot before publication. Concurrent changes retry next time.
      const after = this.store.scan();
      if (JSON.stringify(after.records.map((r) => [r.id, r.version])) !== JSON.stringify(records.map((r) => [r.id, r.version]))) {
        throw new RagError("conflict", "Records changed while indexing; retry");
      }
      const snapshot: Snapshot = { format: FORMAT, model: this.embedder.signature, root: config.root, entries };
      if (!compatible || rebuild || updated || removed || previous.length !== entries.length) atomicWrite(path, JSON.stringify(snapshot));
      const dirty = safePath(config.workspace, join(config.cacheDirectory, "dirty.json"));
      if (existsSync(dirty)) unlinkSync(dirty);
      return { entries, refresh: { total: entries.length, updated, reused, removed, warnings } };
    });
  }
  async search(query: string, options: SearchOptions = {}): Promise<{ matches: Match[]; refresh: Refresh }> {
    if (!query.trim() || query.length > 4000) throw new RagError("invalid_record", "Query must contain 1–4000 characters");
    const limit = options.limit ?? this.store.config.topK;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new RagError("invalid_record", "Search limit must be between 1 and 20");
    const { entries, refresh } = await this.refresh();
    const candidates = entries.filter(({ record }) => matches(record, options) &&
      (options.include_inactive || options.state?.length || record.frontmatter.state === undefined || record.frontmatter.state === "active"));
    if (!candidates.length) return { matches: [], refresh };
    const [vector] = await this.embedder.embed([query]);
    if (!validVectors([vector], 1)) throw new RagError("model_unavailable", "Invalid query vector");
    const ranked: Match[] = candidates.map((entry) => {
      let score = -Infinity, best = 0;
      entry.vectors.forEach((candidate, index) => {
        if (candidate.length !== vector.length) throw new RagError("model_unavailable", "Embedding dimensions changed; rebuild the cache");
        const dot = candidate.reduce((sum, value, offset) => sum + value * vector[offset], 0);
        const norm = Math.sqrt(candidate.reduce((sum, value) => sum + value * value, 0) * vector.reduce((sum, value) => sum + value * value, 0));
        const similarity = norm ? dot / norm : 0;
        if (similarity > score) { score = similarity; best = index; }
      });
      return { id: entry.record.id, version: entry.record.version, title: entry.record.title,
        path: this.store.path(entry.record.id), score: Math.round(score * 1e6) / 1e6,
        excerpt: entry.chunks[best].replace(/\s+/g, " ").slice(0, 240) };
    });
    return { matches: ranked.filter((match) => match.score >= this.store.config.minScore)
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, limit), refresh };
  }
}
