# Agent Exchange

A marketplace for independently installable plugins for GitHub Copilot and OpenAI Codex. Its marketplace identifier is `agent-exchange`.

Each plugin lives under `plugins/<plugin-name>/` and can contain its own skills, agents, MCP servers, instructions, hooks, and supporting files.

## Available plugins

| Plugin | Description | Documentation |
| --- | --- | --- |
| Geist | Ordered workspace instructions, local ONNX document retrieval, and Markdown-record tools | [Installation, configuration, and usage](./plugins/geist/README.md) |

## Register the marketplace

Choose either a local checkout or the GitHub source. Registering the marketplace makes its plugins available to install; follow each plugin's README to install and configure it.

### From a local checkout

Run the command for your host from this repository's root.

OpenAI Codex CLI:

```powershell
codex plugin marketplace add .
```

GitHub Copilot CLI:

```powershell
copilot plugin marketplace add .
```

### From GitHub

Once the marketplace files have been committed and pushed to GitHub:

OpenAI Codex CLI:

```bash
codex plugin marketplace add tsharp/agent-exchange
```

GitHub Copilot CLI:

```bash
copilot plugin marketplace add tsharp/agent-exchange
```

## Layout

```text
.agents/plugins/marketplace.json  # Codex marketplace
.github/plugin/marketplace.json   # Copilot marketplace
.github/workflows/validate.yml    # Marketplace and plugin checks in CI
scripts/validate-marketplace.mjs  # Local validation
plugins/
  <plugin-name>/
    README.md                    # Plugin installation, configuration, and usage
    .codex-plugin/plugin.json    # Codex plugin manifest
    .github/plugin/plugin.json   # Copilot plugin manifest
    ...                          # Plugin-owned components
```

Marketplace source paths are relative to the repository root. Component paths in a plugin manifest are relative to that plugin's directory.

## Develop

Implementation plans are public under `docs/plans/`, starting with the [Geist RAG v1 plan](./docs/plans/rag_v1.plan.md). Follow [the contributor instructions](./AGENTS.md), including Conventional Commits for tested increments of progress.

Keep each plugin's name, version, and shared metadata consistent between its Codex and Copilot manifests.

To add another plugin, create `plugins/<plugin-name>/` with its own `.codex-plugin/plugin.json` and `.github/plugin/plugin.json`, then register it in both marketplace catalogs using `./plugins/<plugin-name>` as the source. Add its README and an entry to the plugin table above. Keep its components inside that directory and configure them using each host's supported discovery and manifest conventions. Skills are optional; plugins can provide different combinations of components.

Repository tooling requires Node.js 22.18 or later. Install development dependencies and run the marketplace and plugin checks:

```bash
npm ci
npm test
```

Marketplace validation checks catalog agreement, separate plugin directories, local source paths, plugin metadata, and skills directories when declared. CI runs the marketplace and plugin checks on Windows and Linux. See each plugin's README for its build process and component-specific tests.
