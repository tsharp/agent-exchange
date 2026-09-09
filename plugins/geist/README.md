# Geist

Geist provides lifecycle hooks for GitHub Copilot and OpenAI Codex. It loads workspace instructions when sessions and subagents start and can call an optional external controller for skill injection, reference context, or stop decisions. Geist does not capture or store conversation logs.

Geist is installed as `geist@agent-exchange`. The current bundle includes the original Geist's hook runtime; its original skills and Mimir MCP server are not included.

## Install

First [register the Agent Exchange marketplace](../../README.md#register-the-marketplace), then install Geist in your host.

Requirements:

- Node.js 22.18 or later on the host's PATH.
- PowerShell 7 (`pwsh`) on PATH for Windows command hooks.

The installed plugin includes its runtime dependencies, so no npm install or build is needed to use it.

### OpenAI Codex CLI

```powershell
codex plugin add geist@agent-exchange
```

Open `/hooks` in Codex to review and trust the installed hooks, then start a new session. Review changed hooks again after updating the plugin. Codex requires this trust step before plugin hooks run; see the [host documentation](https://learn.chatgpt.com/docs/hooks).

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

Instructions belong in each consuming project. Installing the plugin does not create or overwrite them. With no instruction files or controller configured, the hooks are successful no-ops.

## Configure workspace instructions

`.geist/config.toml` defines which instruction files Geist loads and their order:

```toml
[instructions]
files = ["instructions.md", "architecture.md", "conventions.md"]
```

Geist loads only the listed files, in exactly the order they appear in `files`. No instruction filenames receive special treatment, and an absent `.geist/config.toml` means no workspace instructions are loaded.

Create every file listed in `files`. The list must be nonempty and contain no duplicate paths. Paths are relative to the config file's directory and must resolve inside it. A missing configured file, invalid TOML, or a path outside that directory fails the hook.

Instruction files are read at session and subagent startup. After editing them, start a new session to apply the changes to the main session.

### Environment overrides

Set these variables in the environment that launches your host when you need to override project defaults. Absolute paths make file overrides independent of the host's working directory.

| Variable | Effect |
| --- | --- |
| `GEIST_WORKSPACE_DIR` | Overrides the workspace directory supplied by the host payload; otherwise Geist uses the payload's `cwd`, then the process working directory. |
| `GEIST_CONFIG_FILE` | Selects a different TOML instruction configuration file. |
| `GEIST_HOOK_CONTROLLER` | Configures an optional external controller as a JSON string. |

`GEIST_CONFIG_FILE` selects the TOML file; instruction files remain relative to that file's directory and follow its listed order. An explicitly selected configuration file must exist.

## Optional external controller

A controller can select named local skills, supply reference context, or request another turn at a stop event. Configure it by setting `GEIST_HOOK_CONTROLLER` before launching the host. For example, in PowerShell:

```powershell
$env:GEIST_HOOK_CONTROLLER = '{"command":"node","args":["C:/agent-control/controller.mjs"],"events":["UserPromptSubmit","Stop"],"required":false,"timeoutMs":4000}'
```

Replace the example path with your controller. No controller runs when the variable is unset. Optional controller failures log a diagnostic and allow processing to continue; `required: true` makes controller failures fail the hook.

See the [hook reference](./hooks/README.md#external-controller-protocol) for the input/output protocol, skill lookup, time limits, and continuation rules.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Hooks do not run in Codex | Open `/hooks`, review and trust Geist's hooks, then start a new session. |
| The runner cannot start | Check `node --version` and, on Windows, `pwsh --version` in the host environment. |
| Workspace instructions are missing | Check the active project's `.geist/config.toml`, its `instructions.files` list, and any environment overrides, then start a new session. |
| Instruction configuration fails | Confirm the TOML is valid and every listed file exists inside the config directory. |

## Develop Geist

```text
.codex-plugin/plugin.json   # Codex manifest
.github/plugin/plugin.json # Copilot manifest
hooks/                     # Host hook maps and protocol reference
src/hooks/                 # TypeScript implementation
runtime/hooks/run.mjs      # Committed standalone runtime
scripts/                   # Build, validation, and tests
skills/                    # Plugin-owned skill sources
```

From the marketplace root, install development dependencies, rebuild after hook source changes, and run the checks:

```bash
npm ci
npm run build
npm test
```

Commit the generated runtime together with its source. Geist's checks type-check the source, reject stale bundles, validate all twelve host mappings, and test behavior from an isolated installation without npm dependencies. See the [hook reference](./hooks/README.md) for implementation details and the [skills guide](./skills/README.md) for adding skills.
