# Geist

Geist provides ordered workspace instructions and local document retrieval for GitHub Copilot and OpenAI Codex. When RAG is enabled, each user prompt receives a few relevant chunks that the agent can choose to investigate. Geist does not capture or store conversation logs.

Geist is installed as `geist@agent-exchange`. It includes its own Markdown-record MCP server and optional external-controller support. The original Geist's skills and Mimir server are not included.

## Install

First [register the Agent Exchange marketplace](../../README.md#register-the-marketplace), then install Geist in your host.

Requirements:

- Node.js 22.18 or later on the host's PATH.
- PowerShell 7 (`pwsh`) on PATH for Windows command hooks.

Static instructions and record-management tools run from bundled JavaScript. Semantic retrieval additionally needs the one-time [ONNX setup](#enable-document-retrieval).

### OpenAI Codex CLI

```powershell
codex plugin add geist@agent-exchange
```

Codex 0.153.4 loads Geist's portable MCP manifest but skips portable-plugin hooks, so marketplace installation alone shows zero hooks. Until Codex supports both, register equivalent user hooks from the installed plugin:

```powershell
node "<installed-geist>/scripts/setup-codex-hooks.mjs" install
```

This merges six Geist hooks into `~/.codex/hooks.json` (or `CODEX_HOME`), preserves other hooks, and does not grant trust. Restart Codex, open `/hooks`, review and trust the six entries labeled `Geist (Agent Exchange) compatibility`, then start a new session. They appear as user hooks. Review changed hooks again after updating the plugin. See the [host trust documentation](https://learn.chatgpt.com/docs/hooks).

Rerun registration from each new installed snapshot to update the runner paths. Before uninstalling Geist, or once a Codex release discovers its portable hooks directly, run the same script with `remove`. This removes only its compatibility registrations; plugin removal alone cannot remove user hooks. The script keeps a `.geist-backup` of a pre-existing hooks file.

### GitHub Copilot CLI

```powershell
copilot plugin install geist@agent-exchange
```

Start a new session after installation so the plugin's hooks are loaded.

## Quick start

In the project where you want to use Geist, create `.geist/config.toml`:

```toml
[instructions]
files = ["instructions.md"]
```

Then create the listed file, `.geist/instructions.md`:

```markdown
# Project instructions

Use the existing project conventions.
Run the relevant checks before reporting a change as complete.
```

Start a new session from that project and submit your task normally. Geist adds the file's contents to session and subagent startup context. Hooks run automatically at their configured lifecycle points; there is no separate Geist command to invoke.

Instructions belong in each consuming project. Installing the plugin does not create or overwrite them. With no instruction files, RAG, or controller configured, the hooks are successful no-ops. The `[instructions]` table can be omitted in a workspace that only uses RAG.

## Configure workspace instructions

`.geist/config.toml` defines which instruction files Geist loads and their order:

```toml
[instructions]
files = ["instructions.md", "architecture.md", "conventions.md"]
```

Geist loads only the listed files, in exactly the order they appear in `files`. No instruction filenames receive special treatment, and an absent `.geist/config.toml` means no workspace instructions are loaded.

Create every file listed in `files`. The list must be nonempty and contain no duplicate paths. Paths are relative to the config file's directory and must resolve inside it. A missing configured file, invalid TOML, or a path outside that directory fails the hook.

Instruction files are read at session and subagent startup. After editing them, start a new session to apply the changes to the main session.

## User data and global instructions

Geist uses `~/.geist` in the operating system user's home directory (`%USERPROFILE%\.geist` on Windows). Set `GEIST_USER_DIR` to choose another location. On first use it creates `docs/`, `temp/`, and a `.gitignore` that excludes `/cache/` and `/temp/`, preserving existing ignore rules. This directory can become a repository for your personal configuration, instructions, and documents. Geist does not initialize Git, commit, or synchronize it.

Create `~/.geist/config.toml` using the same tables as a project's configuration:

```toml
[instructions]
files = ["instructions.md", "preferences.md"]

[rag]
enabled = true
root = "docs"
```

Create the listed instruction files alongside that config. Global instructions load first, followed by repository instructions; both lists retain their exact TOML order. Global instruction paths are relative to `~/.geist`, and the global record root is also relative to `~/.geist`. There is no nested `~/.geist/.geist` directory. Global and local RAG are enabled independently, with both disabled by default. A global-only setup works in projects without a Geist configuration.

Automatic retrieval searches the enabled stores together. Each store applies its own record filters and minimum score; the enabled project's `top_k`, context budget, and timeout govern combined delivery, falling back to the global settings when project RAG is disabled. Same-named records in the two stores remain distinct. When both configurations resolve to the same record root, combined operations visit it once.

### Environment overrides

Set these variables in the environment that launches your host when you need to override project defaults. Absolute paths make file overrides independent of the host's working directory.

| Variable | Effect |
| --- | --- |
| `GEIST_WORKSPACE_DIR` | Overrides the workspace directory supplied by the host payload; otherwise Geist uses the payload's `cwd`, then the process working directory. |
| `GEIST_CONFIG_FILE` | Selects a different TOML instruction configuration file. |
| `GEIST_USER_DIR` | Overrides the global `.geist` directory and the parent of all caches. |
| `GEIST_HOOK_CONTROLLER` | Configures an optional external controller as a JSON string. |

`GEIST_CONFIG_FILE` selects only the workspace TOML file, including its RAG settings; global configuration still comes from `GEIST_USER_DIR/config.toml`. Instruction files remain relative to their TOML directory and follow its listed order. An explicitly selected configuration file must exist.

## Enable document retrieval

Add a `[rag]` table to your project's `.geist/config.toml`. This can coexist with `[instructions]`:

```toml
[rag]
enabled = true
root = "docs"
top_k = 3
min_score = 0.25
max_context_chars = 1800
timeout_ms = 4000
```

`root` is relative to the project workspace; instruction-file paths remain relative to the TOML directory. Store your Markdown records under that root. YAML frontmatter is optional. Search automatically includes active records and records without a state; draft, proposed, deprecated, superseded, rejected, and unknown states require an explicit MCP filter.

Ask the agent to call Geist's `prepare_runtime` MCP tool. It installs the pinned ONNX runtime and model in the running plugin's directory and verifies a real embedding. Then call `rebuild_cache` for initial indexing, or search immediately. A failed search can be retried after preparation in the same MCP connection. Preparation is safe to repeat and works offline once ready; simultaneous calls share one setup. Allow up to five minutes for the first call if your MCP client has a configurable tool timeout.

Alternatively, from the consuming project, run setup against the **installed plugin directory** reported by your host (replace `<installed-geist>`):

```powershell
node "<installed-geist>/scripts/setup-rag.mjs"
node "<installed-geist>/runtime/rag/run.mjs" index .
```

Explicit preparation installs the pinned ONNX Runtime dependency from npm and downloads the pinned quantized MiniLM model from Hugging Face, about 23 MB plus tokenizer files. Run it once for each new installed plugin snapshot. Hooks and searches never install dependencies or download models. Preparation does not enable workspace retrieval or create records.

For this source checkout, `npm ci` already installs the runtime dependency. From the marketplace root:

```powershell
node plugins/geist/runtime/rag/run.mjs prepare .
node plugins/geist/runtime/rag/run.mjs index .
node plugins/geist/runtime/rag/run.mjs search . "How are documents cached?"
```

After enabling and trusting the hooks, submit prompts normally. Geist refreshes changed records, ranks them using local ONNX embeddings, and injects up to three hints containing record/chunk IDs, paths, titles, scores, headings, metadata, source offsets, and complete bounded chunk content. Hints are explicitly untrusted reference data. The agent can ignore them or call `get_record` for full content; retrieved documents do not become workspace instructions.

Within a session, unchanged chunks are emitted once. Geist checks the top-ranked results and suppresses those already emitted, so a later prompt may receive fewer hints or none. It does not replace suppressed results with lower-ranked chunks. Edits make only changed chunks eligible again; other sections of the same document remain independently retrievable. Explicit MCP/CLI searches always return their normal results.

Fresh sessions, context clearing, and compaction reset this delivery state. Resume preserves it while the state still exists; session end removes it. Codex reports compaction through `SessionStart`; Copilot uses `preCompact` and receives prompt hints through `userPromptTransformed`. After updating Geist, restart your host and review changed hooks as required.

`top_k` accepts 1–20. The total hint text is bounded by `max_context_chars` (256–8000). `min_score` accepts 0–1; fewer hints are returned when chunks score below it. Set it to 0 while exploring a small corpus. `timeout_ms` accepts 100–4500. Retrieval failures leave the prompt usable and emit a short diagnostic. Long prompts use their first 4000 characters as the search query.

See the [chunking specification](docs/chunking.md) for StructuredMarkdown annotations, ordinary Markdown fallback, stable identities, and source offsets. Search limits count chunks, including multiple chunks from one document.

### Cache maintenance

All rebuildable caches live in the user directory: `~/.geist/cache/<repo-id>/rag/` for a workspace and `~/.geist/cache/global/rag/` for global records. The repository ID is the full SHA-256 hash of the canonical absolute workspace path (case-folded on Windows); Git is not required. Different checkouts/worktrees have separate caches, and moving a workspace creates a new cache. Source Markdown remains canonical. Searches hash source files, reuse unchanged chunk embeddings, and refresh additions, edits, deletions, and renames, including changes made by an editor or Git. MCP writes mark the cache dirty; the next search refreshes it before returning results. Query text and query embeddings are not saved.

Deduplication metadata lives in `~/.geist/cache/<repo-id>/rag/sessions/`, including delivery of global chunks to that workspace. Files use hashed host/workspace/record-roots/session keys and contain only store/record/chunk identities and chunk version hashes, with at most the latest 2000 entries per session. They contain no prompts, excerpts, source paths, raw session IDs, or conversation text. Without a session ID, hints remain stateless. Missing or corrupt metadata starts fresh; deleting `sessions/` resets deduplication without rebuilding embeddings. Cache rebuilds alone preserve delivery state. A session that ends abruptly can leave a harmless metadata file until the cache is removed.

Delivery metadata records what Geist emits, not whether the host or model consumed it. It does not track manual document reads. A host interruption after metadata is saved can leave a hint marked as delivered; clearing the session's delivery metadata makes it eligible again.

Keep `.geist/cache/` and `.geist/temp/` in consuming projects' `.gitignore` for old or temporary local data. New caches are always written under the user directory; old workspace caches are ignored and can be removed manually. Within the user `.geist` repository, `/cache/` and `/temp/` are the equivalent ignore rules and are installed automatically. To refresh after substantial changes or rebuild all embeddings:

```powershell
node "<installed-geist>/runtime/rag/run.mjs" index .
node "<installed-geist>/runtime/rag/run.mjs" rebuild .
node "<installed-geist>/runtime/rag/run.mjs" search . --store global "personal preferences"
```

Deleting `documents.json` is also safe; the next search recreates it. Locks from a terminated worker are reclaimed when its PID is no longer alive. If a malformed lock or `.lock.reclaim` file persists after a crash, stop the relevant Geist processes and remove that file before retrying. Initial indexing or large corpora can exceed the prompt deadline; use the explicit index command first. V1 supports up to 2000 Markdown files, each at most 256 KiB.

### Record tools

The plugin registers a local `geist` MCP server for both hosts. Codex loads the portable root `plugin.json` and typed `mcp.json`; Copilot uses its compatibility manifest and `.mcp.json`. Its workspace is the host process working directory, overridable with `GEIST_WORKSPACE_DIR`. The model is loaded only for preparation, search, or rebuild.

| Tool | Purpose |
| --- | --- |
| `prepare_runtime` | Install the pinned runtime/model and verify local inference; safe to repeat. |
| `list_records` | List and filter record metadata with offset/limit pagination. |
| `get_record` | Read raw Markdown, metadata, and a version hash. |
| `search_records` | Retrieve ranked Markdown chunks from the current corpus. |
| `create_record` | Create a Markdown record without replacing existing files. |
| `update_record` | Replace raw Markdown using the version from the latest read. |
| `delete_record` | Delete a record using its current version. |
| `get_links` | Inspect direct incoming/outgoing links, including broken targets. |
| `rebuild_cache` | Recompute the derived cache from all records. |

Record IDs are forward-slash paths relative to `root`, such as `decisions/database.md`. Read before updating, preserve unfamiliar metadata in the replacement Markdown, and provide `expected_version`. Conflicts require rereading the record. Geist does not make Git commits for record writes.

`list_records`, `search_records`, and `rebuild_cache` accept `store: "workspace" | "global" | "all"`, defaulting to `all`. Reads, writes, deletion, and links accept `store: "workspace" | "global"`, defaulting to `workspace` for compatibility. Pass the result's `store` back when reading or changing a global record. Links remain within their store. Listing sorts by store then record ID; search sorts by score, store, record ID, and chunk offset. Explicit operations can access disabled stores; `enabled` controls automatic prompt retrieval. CLI index, rebuild, and search also default to both stores and accept `--store` after the workspace argument. Restart MCP after changing store configuration.

See the [public v1 plan](../../docs/plans/rag_v1.plan.md) for the record schema, search semantics, limits, and acceptance criteria.

## Optional external controller

A controller can select named local skills, supply reference context, or request another turn at a stop event. Configure it by setting `GEIST_HOOK_CONTROLLER` before launching the host. For example, in PowerShell:

```powershell
$env:GEIST_HOOK_CONTROLLER = '{"command":"node","args":["C:/agent-control/controller.mjs"],"events":["UserPromptSubmit","Stop"],"required":false,"timeoutMs":4000}'
```

Replace the example path with your controller. No controller runs when the variable is unset. Optional controller failures log a diagnostic and allow processing to continue; `required: true` makes controller failures fail the hook. When combining prompt retrieval with a controller, keep their combined deadlines below the host's five-second hook timeout; for example, configure each for 2000 ms.

See the [hook reference](./hooks/README.md#external-controller-protocol) for the input/output protocol, skill lookup, time limits, and continuation rules.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Zero Geist hooks in Codex | On Codex 0.153.4, run `setup-codex-hooks.mjs install` from the installed plugin, then restart. |
| Geist hooks are installed but inactive | Open `/hooks`, review and trust the six Geist compatibility hooks, then start a new session. |
| The runner cannot start | Check `node --version` and, on Windows, `pwsh --version` in the host environment. |
| `Hook failed` / `hook exited with code 1` after updating Geist | Check the runner path in `~/.codex/hooks.json`. Compatibility registrations point to a specific installed snapshot; rerun `setup-codex-hooks.mjs install` from the current installed plugin, then restart Codex and review `/hooks`. |
| Workspace instructions are missing | Check the active project's `.geist/config.toml`, its `instructions.files` list, and any environment overrides, then start a new session. |
| Instruction configuration fails | Confirm the TOML is valid and every listed file exists inside the config directory. |
| No document hints appear | Check `[rag].enabled`, run setup and index for the installed plugin, and try `min_score = 0`. Check diagnostics for timeouts or invalid records. |
| MCP reads the wrong record directory | Set `GEIST_WORKSPACE_DIR` in the MCP host environment to the consuming project's absolute path. |
| MCP closes during initialization with a literal `${PLUGIN_ROOT}` path in the error | Check that the installed plugin includes root `plugin.json` and `mcp.json`. Codex 0.153.4 does not expand that placeholder in the legacy `.mcp.json` launch path; the portable MCP configuration handles it. |

To see the underlying startup error on Windows, replay the registered Geist `SessionStart` command from the consuming workspace:

```powershell
$geistCodexDirectory = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$geistHooks = Get-Content -Raw (Join-Path $geistCodexDirectory 'hooks.json') | ConvertFrom-Json
$geistStart = $geistHooks.hooks.SessionStart.hooks | Where-Object { $_.statusMessage -eq 'Geist (Agent Exchange) compatibility: SessionStart' }
@{ cwd = (Get-Location).Path; source = 'startup' } | ConvertTo-Json -Compress | & pwsh -NoProfile -NonInteractive -Command $geistStart.commandWindows
```

This executes the configured startup hook and prints its stderr alongside protocol output. `Cannot find module` naming an old installed snapshot means the registration is stale. That failure happens before Geist starts, so an in-process Geist logger cannot capture it. Persistent failure diagnostics would need to capture launcher stderr as well as runtime errors; prompts, hook payloads, and retrieved content should stay out of diagnostic logs. Geist currently emits runtime diagnostics to stderr and does not maintain a failure log file.

## Develop Geist

```text
plugin.json                # Portable plugin identity for Codex
mcp.json                   # Portable typed MCP configuration
.codex-plugin/plugin.json   # Codex compatibility metadata
.github/plugin/plugin.json # Copilot manifest
.mcp.json                  # Copilot compatibility MCP configuration
hooks/                     # Host hook maps and protocol reference
src/hooks/                 # TypeScript implementation
runtime/hooks/run.mjs      # Committed standalone runtime
runtime/rag/run.mjs        # ONNX setup, indexing, and search CLI
runtime/mcp/run.mjs        # Bundled stdio record server
src/rag/                   # Record store, document cache, and ONNX retrieval
scripts/                   # Build, validation, and tests
skills/                    # Plugin-owned skill sources
```

From the marketplace root, install development dependencies, rebuild after hook source changes, and run the checks:

```bash
npm ci
npm run build
npm test
```

Commit the generated runtime together with its source. Geist's checks type-check the source, reject stale bundles, validate all thirteen host mappings, and test behavior from an isolated installation without npm dependencies. See the [hook reference](./hooks/README.md) for implementation details and the [skills guide](./skills/README.md) for adding skills.

After preparing the model, run `npm run test:onnx --workspace plugins/geist` from the marketplace root for real inference and both prompt adapters. It uses a temporary four-document corpus and reports measured timings, then tests setup in a copied installation; that setup test needs network access. The regular tests use deterministic embeddings for cache and MCP behavior and require no model download.

Bundled dependency licenses are included in `runtime/THIRD_PARTY_NOTICES.txt` and checked during the build.

Run `npm run test:codex --workspace plugins/geist` for an actual Codex installation and MCP startup regression test. It uses a temporary marketplace, isolated Codex configuration, and a separate consuming workspace; no model turn is submitted. Codex must be available as an executable. On Windows, set `GEIST_CODEX_BIN` to the full path of `codex.exe` before running it. Keep the version in `plugin.json`, both compatibility manifests, and `package.json` aligned.

Portable packaging follows the [OpenAI plugin package documentation](https://developers.openai.com/plugins/build/plugins).
