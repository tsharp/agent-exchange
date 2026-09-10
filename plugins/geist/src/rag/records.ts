import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { RagError, safePath, type RagConfig } from "./config.ts";
import { atomicWrite, withLock } from "./files.ts";

export const MAX_RECORD_BYTES = 256 * 1024;
export type Link = { record: string; kind?: string; [key: string]: unknown };
export type Source = { source: string; date?: string; [key: string]: unknown };
export type RecordData = {
  id: string; title: string; body: string; markdown: string; version: string;
  frontmatter: Record<string, unknown>; links: Link[]; sources: Source[];
};
export type Filters = { kind?: string[]; state?: string[]; scope?: string[]; prefix?: string };
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function validateId(id: string): string {
  if (!id || !id.endsWith(".md") || /[\\:\x00-\x1f]/.test(id) || id.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part))) {
    throw new RagError("invalid_id", "Record IDs must be relative forward-slash .md paths");
  }
  return id;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseRecord(id: string, markdown: string): RecordData {
  validateId(id);
  if (Buffer.byteLength(markdown) > MAX_RECORD_BYTES) throw new RagError("invalid_record", "Record exceeds 256 KiB");
  let body = markdown.replace(/^\uFEFF/, "");
  let frontmatter: Record<string, unknown> = {};
  if (/^---\r?\n/.test(body)) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body);
    if (!match) throw new RagError("invalid_record", "Unclosed YAML frontmatter");
    try {
      const document = parseDocument(match[1]);
      if (document.errors.length) throw new Error("Malformed YAML");
      const parsed: unknown = document.toJS({ maxAliasCount: 50 });
      if (!object(parsed)) throw new Error("Frontmatter must be a mapping");
      frontmatter = parsed;
      JSON.stringify(frontmatter); // Circular YAML aliases cannot cross the JSON cache/MCP boundary.
    } catch { throw new RagError("invalid_record", "Invalid YAML frontmatter mapping"); }
    body = body.slice(match[0].length);
  }
  for (const field of ["kind", "state"]) {
    if (frontmatter[field] !== undefined && typeof frontmatter[field] !== "string") throw new RagError("invalid_record", `${field} must be a string`);
  }
  if (frontmatter.scope !== undefined && (!Array.isArray(frontmatter.scope) || frontmatter.scope.some((item) => typeof item !== "string"))) {
    throw new RagError("invalid_record", "scope must be a string list");
  }
  const links = frontmatter.links ?? [];
  const sources = frontmatter.sources ?? [];
  if (!Array.isArray(links) || links.some((link) => !object(link) || typeof link.record !== "string" || (link.kind !== undefined && typeof link.kind !== "string"))) {
    throw new RagError("invalid_record", "links must contain record IDs and optional string kinds");
  }
  for (const link of links) validateId(link.record as string);
  if (!Array.isArray(sources) || sources.some((source) => !object(source) || typeof source.source !== "string" ||
    (source.date !== undefined && (typeof source.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(source.date) ||
      !Number.isFinite(Date.parse(source.date)) || new Date(source.date).toISOString().slice(0, 10) !== source.date)))) {
    throw new RagError("invalid_record", "sources must contain source strings and optional ISO dates");
  }
  return { id, title: /^#\s+(.+)$/m.exec(body)?.[1].trim() || id, body, markdown,
    frontmatter, links: links as Link[], sources: sources as Source[], version: hash(markdown) };
}

export function matches(record: RecordData, filters: Filters): boolean {
  if (filters.prefix && !record.id.startsWith(filters.prefix)) return false;
  for (const field of ["kind", "state"] as const) {
    if (filters[field]?.length && !filters[field]!.includes(record.frontmatter[field] as string)) return false;
  }
  return !filters.scope?.length || filters.scope.some((scope) => (record.frontmatter.scope as string[] | undefined)?.includes(scope));
}

export class RecordStore {
  config: RagConfig;
  constructor(config: RagConfig) { this.config = config; }
  path(id: string): string { return safePath(this.config.workspace, resolve(this.config.root, validateId(id))); }
  get(id: string): RecordData {
    const path = this.path(id);
    try {
      if (!statSync(path).isFile() || statSync(path).size > MAX_RECORD_BYTES) throw new RagError("invalid_record", "Record is not a file or exceeds 256 KiB");
      let markdown: string;
      try { markdown = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(path)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_ENCODING_INVALID_ENCODED_DATA") throw new RagError("invalid_record", "Record must contain valid UTF-8");
        throw error;
      }
      return parseRecord(id, markdown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new RagError("not_found", `Record not found: ${id}`);
      throw error;
    }
  }
  scan(): { records: RecordData[]; warnings: string[] } {
    safePath(this.config.workspace, this.config.root);
    const records: RecordData[] = [], warnings: string[] = [];
    let count = 0;
    const visit = (directory: string, prefix: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
        const id = prefix + entry.name;
        if (entry.isSymbolicLink()) { warnings.push(`Skipped linked path: ${id}`); continue; }
        if (entry.isDirectory()) { safePath(this.config.workspace, join(directory, entry.name)); visit(join(directory, entry.name), `${id}/`); }
        else if (entry.name.endsWith(".md")) {
          if (++count > 2000) throw new RagError("invalid_record", "Store exceeds the v1 limit of 2000 records");
          try { records.push(this.get(id)); }
          catch { warnings.push(`Skipped invalid record: ${id}`); }
        }
      }
    };
    if (existsSync(this.config.root)) visit(this.config.root, "");
    return { records, warnings };
  }
  async write(id: string, markdown: string, expectedVersion?: string): Promise<RecordData> {
    const parsed = parseRecord(id, markdown);
    return withLock(this.config, "records", () => {
      const path = this.path(id);
      if (expectedVersion !== undefined) {
        if (this.get(id).version !== expectedVersion) throw new RagError("conflict", "Record changed; read it again before updating");
        atomicWrite(path, markdown);
      } else {
        mkdirSync(dirname(path), { recursive: true });
        safePath(this.config.workspace, path);
        const temp = join(dirname(path), `.${randomUUID()}.tmp`);
        try {
          writeFileSync(temp, markdown, { flag: "wx" });
          linkSync(temp, path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new RagError("already_exists", `Record already exists: ${id}`);
          throw error;
        } finally { if (existsSync(temp)) unlinkSync(temp); }
      }
      this.invalidate();
      return parsed;
    });
  }
  async delete(id: string, expectedVersion: string): Promise<void> {
    await withLock(this.config, "records", () => {
      if (this.get(id).version !== expectedVersion) throw new RagError("conflict", "Record changed; read it again before deleting");
      unlinkSync(this.path(id));
      this.invalidate();
    });
  }
  invalidate(): void {
    // Source hashes are authoritative; the marker also makes pending edits observable.
    atomicWrite(safePath(this.config.cacheRoot, join(this.config.cacheDirectory, "dirty.json")), JSON.stringify({ dirty: true }));
  }
  links(id: string) {
    this.get(id);
    const { records, warnings } = this.scan();
    const ids = new Set(records.map((record) => record.id));
    const edges = records.flatMap((record) => record.links.map((link) => ({ source: record.id, target: link.record,
      ...(link.kind ? { kind: link.kind } : {}), resolved: ids.has(link.record) })));
    return { outgoing: edges.filter((edge) => edge.source === id), incoming: edges.filter((edge) => edge.target === id), warnings };
  }
}
