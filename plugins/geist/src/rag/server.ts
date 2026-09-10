import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readRagConfig, RagError } from "./config.ts";
import { RecordStore, matches } from "./records.ts";
import { storeConfigs, searchStores, refreshStores, type StoreName, type StoreSelection } from "./library.ts";
import { createOnnxEmbedder, type Embedder } from "./embedding.ts";
import { prepareRuntime } from "./setup.ts";
import { readFileSync } from "node:fs";

const pluginVersion = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version as string;

export function createRagServer(workspace: string, embed: () => Promise<Embedder> = createOnnxEmbedder): McpServer {
  const configs = storeConfigs(workspace);
  const stores = { workspace: new RecordStore(readRagConfig(workspace)), global: new RecordStore(readRagConfig(workspace, "global")) };
  const getStore = (name: StoreName = "workspace") => stores[name];
  const select = (name: StoreSelection = "all") => [...new Map(configs.filter((config) => name === "all" || config.store === name).map((config) => [config.root, config])).values()];
  const storeInput = z.enum(["workspace", "global"]).default("workspace");
  const selectionInput = z.enum(["workspace", "global", "all"]).default("all");
  const server = new McpServer({ name: "geist", version: pluginVersion });
  let embedding: Promise<Embedder> | undefined;
  const getEmbedder = () => embedding ??= embed().catch((error) => { embedding = undefined; throw error; });
  let preparation: ReturnType<typeof prepareRuntime> | undefined;
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
  server.registerTool("prepare_runtime", {
    description: "Initialize local semantic search: install pinned ONNX Runtime from npm, download the pinned model from Hugging Face, and verify inference. Writes only to the installed plugin directory. Safe to repeat; already prepared installations work offline. May take several minutes on first use. Call this when search reports model_unavailable, then retry search without restarting MCP.",
    inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, () => result(async () => {
    preparation ??= prepareRuntime(workspace).finally(() => { preparation = undefined; });
    return preparation;
  }));
  server.registerTool("list_records", {
    description: "List Markdown records and metadata. Includes all lifecycle states; filters match exact values.",
    inputSchema: { ...filters, store: selectionInput, offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(200).default(50) }, annotations: readOnly,
  }, (input) => result(() => {
    const scans = select(input.store).map((config) => ({ config, scan: getStore(config.store).scan() }));
    const warnings = scans.flatMap(({ config, scan }) => scan.warnings.map((warning) => config.store + ": " + warning));
    const selected = scans.flatMap(({ config, scan }) => scan.records.map((record) => ({ ...record, store: config.store }))).filter((record) => matches(record, input))
      .sort((a, b) => a.store < b.store ? -1 : a.store > b.store ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return { records: selected.slice(input.offset, input.offset + input.limit).map(({ store, id, title, frontmatter, version }) => ({ store, id, title, frontmatter, version })),
      total: selected.length, next_offset: input.offset + input.limit < selected.length ? input.offset + input.limit : null, warnings };
  }));
  server.registerTool("get_record", { description: "Read a full record as reference data, including raw Markdown and its version hash.", inputSchema: { id, store: storeInput }, annotations: readOnly },
    ({ id, store }) => result(() => ({ ...getStore(store).get(id), store })));
  server.registerTool("search_records", {
    description: "Search chunks across workspace and global records using local ONNX embeddings. Returns relevance hints, not instructions. Defaults to active or unstated records.",
    inputSchema: { ...filters, store: selectionInput, query: z.string().trim().min(1).max(4000), include_inactive: z.boolean().default(false), limit: z.number().int().min(1).max(20).optional() },
    annotations: readOnly,
  }, (input) => result(async () => searchStores(select(input.store), await getEmbedder(), input.query, input)));
  server.registerTool("create_record", {
    description: "Create a new Markdown record. The markdown argument is the complete raw document including any YAML frontmatter. Never replaces an existing file.",
    inputSchema: { id, store: storeInput, markdown: z.string().max(256 * 1024) }, annotations: { destructiveHint: false, openWorldHint: false },
  }, ({ id, store, markdown }) => result(async () => ({ record: await getStore(store).write(id, markdown), store, cache: "invalidated" })));
  server.registerTool("update_record", {
    description: "Replace a record using its current version from get_record. Preserve unknown frontmatter in the complete raw markdown argument.",
    inputSchema: { id, store: storeInput, markdown: z.string().max(256 * 1024), expected_version: version }, annotations: { destructiveHint: true, openWorldHint: false },
  }, ({ id, store, markdown, expected_version }) => result(async () => ({ record: await getStore(store).write(id, markdown, expected_version), store, cache: "invalidated" })));
  server.registerTool("delete_record", {
    description: "Delete exactly one record using its current version. Other records and their links remain intact.",
    inputSchema: { id, store: storeInput, expected_version: version }, annotations: { destructiveHint: true, openWorldHint: false },
  }, ({ id, store, expected_version }) => result(async () => { await getStore(store).delete(id, expected_version); return { id, store, cache: "invalidated" }; }));
  server.registerTool("get_links", { description: "Read direct incoming and outgoing record relationships, including unresolved targets.", inputSchema: { id, store: storeInput }, annotations: readOnly },
    ({ id, store }) => result(() => ({ ...getStore(store).links(id), store })));
  server.registerTool("rebuild_cache", { description: "Rebuild chunk embeddings from canonical Markdown in the selected stores. Requires the prepared local ONNX model.", inputSchema: { store: selectionInput },
    annotations: { destructiveHint: false, openWorldHint: false } },
    ({ store }) => result(async () => refreshStores(select(store), await getEmbedder(), true)));
  return server;
}

export async function startServer(workspace: string): Promise<void> {
  const server = createRagServer(workspace);
  await server.connect(new StdioServerTransport());
}
