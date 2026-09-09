---
kind: plan
state: active
version: 2026-09-09
---
# Geist RAG v1

This public plan records the implementation contract. The original draft is preserved in Git history. Conversation logging remains outside Geist's scope.

## Outcome and flow

1. A workspace enables RAG in `.geist/config.toml` and prepares the local ONNX model once.
2. Markdown files under the record root are canonical. Each file is a record identified by its root-relative path.
3. Before search, scan and hash current files, embed changed documents, reuse unchanged embeddings, and remove deleted documents from a rebuildable cache.
4. On every user prompt, automatically select up to `top_k` documents (default 3).
5. Inject bounded, untrusted relevance hints: IDs, titles, source paths, scores, and excerpts. The agent decides whether to read full records through MCP or file tools. Preserve the separate, ordered TOML instruction flow.
6. MCP exposes discovery, reads, search, writes, relationships, and cache rebuild. Mutations invalidate affected cache entries; the next search synchronizes before returning results.

V1 uses local CPU ONNX inference, normalized embeddings, cosine ranking, deterministic chunks, and a JSON cache. ONNX computes embeddings; JSON stores derived documents and vectors. Reranking, hosted inference, background watchers, a persistent retrieval daemon, graph traversal, and automatic knowledge creation are deferred.

## Configuration and installation

```toml
# .geist/config.toml
[instructions]
files = ["instructions.md", "architecture.md"]

[rag]
enabled = true
root = "docs"
top_k = 3
min_score = 0.25
max_context_chars = 1800
timeout_ms = 4000
```

Both tables are optional. RAG is disabled by default. Instruction paths remain relative to the TOML directory. The record root is relative to the active workspace and must remain inside it. Existing `GEIST_CONFIG_FILE` and `GEIST_WORKSPACE_DIR` overrides apply.

Ranges: `top_k` 1–20; `min_score` 0–1; `max_context_chars` 256–8000; `timeout_ms` 100–4500. Unknown RAG keys fail validation. Disabled RAG performs no retrieval work.

Store the cache at `.geist/cache/rag/documents.json`. Keep the downloaded model in the prepared plugin's `models/` directory. Pin `Xenova/all-MiniLM-L6-v2` revision `751bff37182d3f1213fa05d7196b954e230abad9`, quantized ONNX, CPU execution, normalized mean pooling. Model, chunker, and cache schema changes invalidate embeddings.

Ship bundled hooks, CLI, and MCP entry points. The explicit `prepare_runtime` MCP tool (or setup script) installs pinned native/runtime dependencies and downloads the pinned model. It verifies a real embedding, reuses prepared assets offline, shares concurrent preparation within one server, and allows search to recover without restarting MCP. Installer output stays off protocol stdout. Hooks and searches never invoke npm or download models. MCP starts without loading the model; record tools work before preparation. Preparation changes neither workspace configuration nor records.

Codex loads root `plugin.json` and typed `mcp.json` using the Agent Plugins 1.0 schemas, so `${PLUGIN_ROOT}` resolves at installation/launch. Keep `.codex-plugin/plugin.json` as compatibility metadata and `.mcp.json` for Copilot. Legacy Codex MCP configuration does not expand the plugin-root placeholder; tests must exercise host loading, not only substitute an absolute path themselves.

Codex 0.153.4 explicitly skips hook loading for portable plugins. Keep the working portable MCP package and provide `scripts/setup-codex-hooks.mjs install|remove` as a temporary user-hook registration workaround. It preserves unrelated hooks, replaces its previous registrations on update, and never grants trust. Remove these registrations before plugin uninstall or migration to native portable-hook discovery. Marketplace installation alone does not activate hooks on this host version.

## Records

Default root: `docs/`. Recursively scan `.md` files, including hidden directories. Directory names have no semantic meaning. IDs use `/`, end in `.md`, and contain no empty, `.` or `..` components. Reject absolute paths, Windows alternate streams, and symlink/junction files or directories. Apply containment checks to discovery, reads, and writes. IDs compare case-sensitively; creation also respects filesystem collision rules.

Records are UTF-8 Markdown with optional YAML frontmatter at the beginning. Limits: 256 KiB per record and 2000 records per store. Exclude invalid records from scans with warnings; direct reads fail. A missing root lists as empty and can be created by the first write.

```markdown
---
kind: decision
state: active
scope: ["service:checkout"]
links:
  - record: constraints/database-ownership.md
    kind: supports
sources:
  - date: "2026-09-08"
    source: "PR 1842"
---
# Checkout database ownership
Checkout owns its transactional data.
```

All metadata is optional. Frontmatter must be a mapping; circular YAML aliases are rejected because results and caches use JSON. `kind` and `state` are strings; `scope` is a string list. Links require root-relative `record` and allow string `kind`. Sources require string `source` and allow an ISO `YYYY-MM-DD` string `date`. Preserve unknown metadata and values. Mutation accepts complete raw Markdown, preserving YAML formatting and comments. Titles use the first H1, then the record ID.

Recognized kinds: decision, fact, idea, constraint, preference, proposal, requirement, exception. Recognized states: draft, proposed, active, deprecated, superseded, rejected. No automatic lifecycle transitions or inferred relationship semantics. Broken links remain observable.

## Cache and retrieval

Store parsed records, SHA-256 versions, chunks, and embeddings. Hash source bytes to detect even same-timestamp edits. Reuse unchanged documents. Renames are deletion plus creation. Missing, corrupt, or incompatible caches rebuild from records; explicit rebuild ignores cached embeddings. Publish snapshots atomically and serialize cooperating cache writers with a process lock. Busy or abandoned locks produce diagnostics instead of stale results. Cache deletion never changes records.

Chunk the complete body into windows of at most 1000 characters with 150-character overlap, prefixing the title. Rank each document by its best chunk cosine score and use that chunk's excerpt. Sort by descending score, then ID. Queries are nonempty and at most 4000 characters. Query text and query embeddings are never persisted.

Search defaults to active or omitted state. Explicit state filters can select any state; `include_inactive` allows all states. Kind/state/scope filters use exact strings, OR within a filter and AND across filters. Scopes imply no hierarchy. Listing includes all states.

Inject hints as JSON wrapped in an untrusted-reference label. Include fewer than top_k when score or character budgets exclude results. Never automatically fetch full bodies into the prompt. Automatic retrieval uses the first 4000 prompt characters. Missing models, retrieval errors, locks, and timeouts fail open with short stderr diagnostics. A subprocess deadline bounds prompt-time scanning and inference. Prepare large changes explicitly with the index command.

### Session delivery

For automatic hints, remember the last emitted version of each document within a host, workspace, record root, and session. Select the normal top_k results first, then suppress unchanged documents already emitted; do not fill the gaps with lower-ranked results. Mark only hints that fit the output budget. Changed documents and new sessions are eligible again. Explicit MCP/CLI search remains unaffected.

Store only document IDs and version hashes in `.geist/cache/rag/sessions/`, using a hash of the host, record root, and session identity as the filename. No prompts, excerpts, conversation content, or raw session IDs enter this delivery state. Keep at most the latest 2000 document entries per session. Missing/corrupt state starts fresh. Without a session ID, retain stateless hints. SessionEnd removes the session's state; orphaned state can be deleted with the cache.

Reset delivery state on fresh/cleared sessions and compaction, but preserve it on resume while it exists. Codex uses `SessionStart` with source `compact` or `clear`; Copilot uses `preCompact`. Copilot prompt hints use `userPromptTransformed` and preserve the original transformed prompt. Delivery runs after successful optional stages/controllers, so blocking or failed processing does not consume hints. Metadata records hook emission, not confirmation that the host or model consumed the hints.

## MCP and CLI

The local stdio MCP server is named `geist`. Tools expose input schemas and structured JSON results plus matching text JSON. Domain errors return `isError`, a code, and message: invalid_config, invalid_id, invalid_record, not_found, already_exists, conflict, busy, model_unavailable, or io_error.

| Tool | Input | Result |
| --- | --- | --- |
| prepare_runtime | No arguments | prepared, pinned model signature, embedding dimensions; initialization errors use model_unavailable |
| list_records | Optional kind/state/scope lists, prefix, offset (0), limit (50, max 200) | Summaries sorted by ID, total, next offset, warnings |
| get_record | id | ID, title, body, metadata, links, sources, raw Markdown, SHA-256 version |
| search_records | query; optional filters, include_inactive, limit (top_k, max 20) | Ranked IDs, versions, titles, paths, scores, excerpts, warnings, refresh counts |
| create_record | id, complete raw markdown | Created record and cache invalidation status; existing files fail |
| update_record | id, complete raw markdown, expected_version | Updated record; missing or changed records fail |
| delete_record | id, expected_version | Deleted ID and cache invalidation status |
| get_links | id | Incoming/outgoing edges with source, target, optional kind, resolved status |
| rebuild_cache | No arguments | Refresh counts and warnings |

Updates replace the complete document. Read first, retain unknown metadata, and supply its version hash. Write temporary sibling files and publish atomically; create exclusively. Serialize cooperating writers. Version checks detect intervening edits but cannot prevent an external editor racing in the final check/publication interval. Deletion leaves other records and unresolved links intact. Git operations remain external.

CLI commands: prepare, index, rebuild, search. Accept an explicit workspace when launched outside the consuming project.

## Acceptance criteria

- Ordered static instructions still work on both hosts, with no conversation capture.
- Each configured prompt receives up to three configurable document hints within execution and text budgets.
- Repeated hints are suppressed across hook processes in one session; edits and compaction restore eligibility. Budget exclusions, isolated sessions/hosts/roots, resume, cleanup, corrupt state, and blocked processing are tested without recording conversations.
- A real local ONNX run demonstrates semantic retrieval.
- Cache tests cover reuse, changes, deletions, renames, corruption, model/schema invalidation, rebuild, and no prompt persistence.
- MCP tests cover tools, schemas, metadata preservation, filters, backlinks, conflicts, and containment.
- Copied bundles run outside the checkout; prepared retrieval runs offline. Static hooks and non-search tools need no model dependency.
- Commit source, generated bundles, docs, and this plan in tested Conventional Commit increments.

## Implementation validation

The v1 implementation is available in `plugins/geist`. The repository enables retrieval over `docs/` in `.geist/config.toml`; its document cache and prepared model remain local and ignored by Git.

Windows validation passes 52 standard tests covering instructions, copied hook installations, records, cache behavior, MCP, prompt budgets, lock recovery, and session deduplication. Two explicit ONNX integration tests verify semantic ranking, both prompt adapters, repeated/edited documents, compaction resets, refresh/rebuild, and a cold installed MCP server recovering from unavailable search through concurrent preparation calls without restarting. Repeated preparation succeeds without the setup script. The four-document fixture indexed in about 214 ms, searched in 201 ms, and completed initial prompt hooks in about 310 ms. These are small-corpus smoke measurements, not a latency guarantee.

A search for “How does Geist update or rebuild cached documents?” retrieves this plan. Hook adapter tests invoke the shipped commands; they do not establish interactive hook trust. The explicit `test:codex` integration test installs the package through Codex 0.153.4 and verifies MCP initialization and six registered user hooks through its app server from a separate workspace, with no model turn. It verifies registration idempotence, unrelated-hook preservation, removal, untrusted status, and execution of the host-resolved command against consuming-project instructions. Package paths include spaces and shell metacharacters. The standard suite is configured for Windows and Linux CI; Linux execution was not performed locally.

## References

- [Tokenizers.js](https://github.com/huggingface/tokenizers.js): text tokenization without image-processing dependencies.
- [ONNX Runtime](https://onnxruntime.ai/docs/get-started/with-javascript/node.html): local inference.
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools): schemas and structured results.
- [Codex hooks](https://learn.chatgpt.com/docs/hooks): session identity and post-compaction SessionStart.
- [Codex 0.153.4 plugin loader](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/core-plugins/src/loader.rs#L954): the released host skips hook sources for portable `AgentPlugin` manifests, despite the broader documented contract.
- [Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference): transformed prompts and preCompact notifications.
