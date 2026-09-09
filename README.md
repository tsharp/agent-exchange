# Agent Exchange

A marketplace for shared Agent Skills for GitHub Copilot and OpenAI Codex, modeled after Geist. Both hosts install the same `agent-exchange` plugin from the repository root and share the `skills/` directory.

This is the initial marketplace scaffold. No skills, hooks, or MCP servers are bundled yet.

## Use this checkout

Run these commands from the repository root to register the local marketplace and install its plugin.

### OpenAI Codex CLI

```powershell
codex plugin marketplace add .
codex plugin add agent-exchange@agent-exchange
```

### GitHub Copilot CLI

```powershell
copilot plugin marketplace add .
copilot plugin install agent-exchange@agent-exchange
```

## Install from GitHub

Once the marketplace files have been committed and pushed to GitHub:

```bash
codex plugin marketplace add tsharp/agent-exchange
codex plugin add agent-exchange@agent-exchange
```

```bash
copilot plugin marketplace add tsharp/agent-exchange
copilot plugin install agent-exchange@agent-exchange
```

## Layout

```text
.agents/plugins/marketplace.json  # Codex marketplace
.codex-plugin/plugin.json         # Codex plugin manifest
.github/plugin/marketplace.json   # Copilot marketplace
.github/plugin/plugin.json        # Copilot plugin manifest
.github/workflows/validate.yml    # Manifest validation in CI
scripts/validate-marketplace.mjs  # Local validation
skills/                          # Shared skill sources
```

Marketplace source paths are relative to the repository root. Both catalogs use `./`, following Geist's single-plugin layout.

## Develop

Add reusable skills under `skills/<category>/<skill-name>/`; see [the skills guide](./skills/README.md). Keep the plugin name, version, and shared metadata consistent between the Codex and Copilot manifests. Register additional plugins in both marketplace catalogs if the repository grows beyond a single bundle.

Run the manifest checks with Node.js 22 or later; no dependency installation is required:

```bash
npm test
```

Validation checks marketplace agreement, local source paths, plugin metadata, and the shared skills directory. It does not validate skill content or execute hooks.
