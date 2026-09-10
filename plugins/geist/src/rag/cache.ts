import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { RagError, safePath } from "./config.ts";
import { atomicWrite, withLock } from "./files.ts";
import { RecordStore, matches, type Filters, type RecordData } from "./records.ts";
import { chunkMarkdown, CHUNKER_SIGNATURE, type MarkdownChunk } from "./chunking.ts";
import type { Embedder } from "./embedding.ts";

const FORMAT = `geist-chunk-cache-v2:${CHUNKER_SIGNATURE}`;
type Entry = { record: RecordData; chunks: MarkdownChunk[]; vectors: number[][] };
type Snapshot = { format: string; model: string; root: string; entries: Entry[] };
export type Refresh = { total: number; updated: number; reused: number; removed: number; warnings: string[] };
export type SearchOptions = Filters & { limit?: number; include_inactive?: boolean };
export type Match = { store: "workspace" | "global"; id: string; version: string; title: string; path: string; score: number; excerpt: string; chunk_id: string; chunk_version: string; content: string; headings: string[]; metadata: Record<string, string>; start: number; end: number };

export function chunksFor(record: RecordData): MarkdownChunk[] {
  return chunkMarkdown(record.body, record.title);
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
      const path = safePath(config.cacheRoot, join(config.cacheDirectory, "documents.json"));
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
          const reusable = new Map<string, number[]>();
          if (!rebuild && cached && Array.isArray(cached.chunks) && cached.chunks.every((chunk) => chunk && typeof chunk.version === "string") && validVectors(cached.vectors, cached.chunks.length)) {
            cached.chunks.forEach((chunk, index) => reusable.set(chunk.version, cached.vectors[index]));
          }
          const missing = chunks.filter((chunk) => !reusable.has(chunk.version));
          const fresh = missing.length ? await this.embedder.embed(missing.map((chunk) => chunk.embeddingText)) : [];
          if (missing.length && !validVectors(fresh, missing.length)) throw new RagError("model_unavailable", "Embedding model returned invalid vectors");
          missing.forEach((chunk, index) => reusable.set(chunk.version, fresh[index]));
          const vectors = chunks.map((chunk) => reusable.get(chunk.version)!);
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
      const dirty = safePath(config.cacheRoot, join(config.cacheDirectory, "dirty.json"));
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
    const ranked: Match[] = candidates.flatMap((entry) => {
      const seen = new Set<string>();
      return entry.chunks.flatMap((chunk, index) => {
        if (seen.has(chunk.id)) return [];
        seen.add(chunk.id);
        const candidate = entry.vectors[index];
        if (candidate.length !== vector.length) throw new RagError("model_unavailable", "Embedding dimensions changed; rebuild the cache");
        const dot = candidate.reduce((sum, value, offset) => sum + value * vector[offset], 0);
        const norm = Math.sqrt(candidate.reduce((sum, value) => sum + value * value, 0) * vector.reduce((sum, value) => sum + value * value, 0));
        const score = norm ? dot / norm : 0;
        return [{ store: this.store.config.store, id: entry.record.id, version: entry.record.version, title: entry.record.title,
          path: this.store.path(entry.record.id), score: Math.round(score * 1e6) / 1e6,
          chunk_id: chunk.id, chunk_version: chunk.version, content: chunk.text, headings: chunk.headings, metadata: chunk.metadata,
          start: chunk.start, end: chunk.end, excerpt: chunk.text.replace(/\s+/g, " ").slice(0, 240) }];
      });
    });
    return { matches: ranked.filter((match) => match.score >= this.store.config.minScore)
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.start - b.start)).slice(0, limit), refresh };
  }
}
