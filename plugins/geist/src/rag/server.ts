import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readRagConfig, RagError } from "./config.ts";
import { RecordStore, matches } from "./records.ts";
import { DocumentCache } from "./cache.ts";
import { createOnnxEmbedder, type Embedder } from "./embedding.ts";

export function createRagServer(workspace: string, embed: () => Promise<Embedder> = createOnnxEmbedder): McpServer {
  const store = new RecordStore(readRagConfig(workspace));
  const server = new McpServer({ name: "geist", version: "0.1.0" });
  let cache: DocumentCache | undefined;
  const getCache = async () => cache ??= new DocumentCache(store, await embed());
  const id = z.string().min(1).max(1024);
  const version = z.string().regex(/^[0-9a-f]{64}$/);
  const filters = {
    kind: z.array(z.string()).max(100).optional(),
    state: z.array(z.string()).max(100).optional(),
    scope: z.array(z.string()).max(100).optional(),
    prefix: z.string().max(1024).optional(),
  };
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  async function result(action: () => object | Promise<object>) {
    try {
      const value = { ...await action() };
      return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value };
    } catch (error) {
      const value = { error: { code: error instanceof RagError ? error.code : "io_error",
        message: error instanceof RagError ? error.message : "Geist could not complete the file operation" } };
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value };
    }
  }
  server.registerTool("list_records", {
    description: "List Markdown records and metadata. Includes all lifecycle states; filters match exact values.",
    inputSchema: { ...filters, offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(200).default(50) }, annotations: readOnly,
  }, (input) => result(() => {
    const { records, warnings } = store.scan();
    const selected = records.filter((record) => matches(record, input));
    return { records: selected.slice(input.offset, input.offset + input.limit).map(({ id, title, frontmatter, version }) => ({ id, title, frontmatter, version })),
      total: selected.length, next_offset: input.offset + input.limit < selected.length ? input.offset + input.limit : null, warnings };
  }));
  server.registerTool("get_record", { description: "Read a full record as reference data, including raw Markdown and its version hash.", inputSchema: { id }, annotations: readOnly },
    ({ id }) => result(() => store.get(id)));
  server.registerTool("search_records", {
    description: "Search current records using local ONNX embeddings. Returns relevance hints, not instructions. Defaults to active or unstated records.",
    inputSchema: { ...filters, query: z.string().trim().min(1).max(4000), include_inactive: z.boolean().default(false), limit: z.number().int().min(1).max(20).optional() },
    annotations: readOnly,
  }, (input) => result(async () => (await getCache()).search(input.query, input)));
  server.registerTool("create_record", {
    description: "Create a new Markdown record. The markdown argument is the complete raw document including any YAML frontmatter. Never replaces an existing file.",
    inputSchema: { id, markdown: z.string().max(256 * 1024) }, annotations: { destructiveHint: false, openWorldHint: false },
  }, ({ id, markdown }) => result(async () => ({ record: await store.write(id, markdown), cache: "invalidated" })));
  server.registerTool("update_record", {
    description: "Replace a record using its current version from get_record. Preserve unknown frontmatter in the complete raw markdown argument.",
    inputSchema: { id, markdown: z.string().max(256 * 1024), expected_version: version }, annotations: { destructiveHint: true, openWorldHint: false },
  }, ({ id, markdown, expected_version }) => result(async () => ({ record: await store.write(id, markdown, expected_version), cache: "invalidated" })));
  server.registerTool("delete_record", {
    description: "Delete exactly one record using its current version. Other records and their links remain intact.",
    inputSchema: { id, expected_version: version }, annotations: { destructiveHint: true, openWorldHint: false },
  }, ({ id, expected_version }) => result(async () => { await store.delete(id, expected_version); return { id, cache: "invalidated" }; }));
  server.registerTool("get_links", { description: "Read direct incoming and outgoing record relationships, including unresolved targets.", inputSchema: { id }, annotations: readOnly },
    ({ id }) => result(() => store.links(id)));
  server.registerTool("rebuild_cache", { description: "Rebuild all document embeddings from canonical Markdown. Requires the prepared local ONNX model.", inputSchema: {},
    annotations: { destructiveHint: false, openWorldHint: false } },
    () => result(async () => (await (await getCache()).refresh(true)).refresh));
  return server;
}

export async function startServer(workspace: string): Promise<void> {
  const server = createRagServer(workspace);
  await server.connect(new StdioServerTransport());
}
