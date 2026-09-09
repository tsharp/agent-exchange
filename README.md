# Agent Exchange

A marketplace for independently installable plugins for GitHub Copilot and OpenAI Codex. The marketplace is `agent-exchange`; its first plugin is `geist`.

Each plugin lives under `plugins/<plugin-name>/` and can contain its own skills, agents, MCP servers, instructions, hooks, and supporting files. Geist is currently a scaffold with no bundled functionality.

## Use this checkout

Run these commands from the repository root to register the local marketplace and install its plugin.

### OpenAI Codex CLI

```powershell
codex plugin marketplace add .
codex plugin add geist@agent-exchange
```

### GitHub Copilot CLI

```powershell
copilot plugin marketplace add .
copilot plugin install geist@agent-exchange
```

## Install from GitHub

Once the marketplace files have been committed and pushed to GitHub:

```bash
codex plugin marketplace add tsharp/agent-exchange
codex plugin add geist@agent-exchange
```

```bash
copilot plugin marketplace add tsharp/agent-exchange
copilot plugin install geist@agent-exchange
```

## Layout

```text
.agents/plugins/marketplace.json  # Codex marketplace
.github/plugin/marketplace.json   # Copilot marketplace
.github/workflows/validate.yml    # Manifest validation in CI
scripts/validate-marketplace.mjs  # Local validation
plugins/
  geist/
    .codex-plugin/plugin.json     # Geist's Codex manifest
    .github/plugin/plugin.json   # Geist's Copilot manifest
    skills/                      # Geist's shared skill sources
```

Marketplace source paths are relative to the repository root. Both catalogs point Geist to `./plugins/geist`. Component paths in a plugin manifest are relative to that plugin's directory.

## Develop

Add Geist skills under `plugins/geist/skills/<category>/<skill-name>/`; see [the skills guide](./plugins/geist/skills/README.md). Keep each plugin's name, version, and shared metadata consistent between its Codex and Copilot manifests.

To add another plugin, create `plugins/<plugin-name>/` with its own `.codex-plugin/plugin.json` and `.github/plugin/plugin.json`, then register it in both marketplace catalogs using `./plugins/<plugin-name>` as the source. Keep its components inside that directory and configure them using each host's supported discovery and manifest conventions. Skills are optional; plugins can provide different combinations of components. Installing a plugin selects that bundle independently of the others.

Run the manifest checks with Node.js 22 or later; no dependency installation is required:

```bash
npm test
```

Validation checks marketplace agreement, separate plugin directories, local source paths, plugin metadata, and shared skills directories when declared. It does not validate component content, host support for other components, or execute hooks.
