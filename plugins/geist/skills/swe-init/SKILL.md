---
name: swe-init
description: Configure or repair Geist startup routing for selected personal or workspace style skills. Use when asked to activate existing styles; creating or refining style content is separate authoring work.
metadata:
  version: 1.1.0
  updated: 2026-10-14
  status: stable
---

# Initialize style routing

## Overview

Configure selected styles through Geist's standard instruction injection.
Personal style packages belong in `~/.geist/skills` (or `GEIST_USER_DIR/skills`);
project packages belong in the workspace's skill directories. Geist ships the
setup mechanism without anyone's personal rules, interviews, or samples.

## Steps

1. Identify the existing style packages to activate. Use names specified by the
   user or already configured in `[instructions].skills`. Read their descriptions
   to establish scope. Keep interviews, samples, and unaccepted proposals as
   evidence outside the routed skills. If content must be authored first, derive
   candidate rules from the user's evidence and confirm them before activation.
2. Establish configuration scope. Default to the workspace; use `--global` for
   requested personal defaults across projects. Locate the active Geist copy
   from this skill or the host's plugin listing. Require `plugin.json` and the
   built `runtime/hooks/run.mjs`. Independently installed copies of this skill
   must pass that Geist directory with `--geist-dir`.
3. Run the bundled [setup script](scripts/setup.mjs) with `--check` and one
   `--skill <name>` per selected style. Continue without `--check` when setup is
   authorized and configuration is missing. Repeat `--check` afterward. Missing,
   malformed, or ambiguous skill routes fail before any configuration write.
   Existing files, other skill selections, and RAG settings are preserved. The
   first change saves the original bytes to `config.toml.swe-init-backup`;
   rewritten TOML normalizes comments and formatting.
4. Verify the host hooks refer to that Geist copy. For Codex compatibility hooks,
   run its `scripts/setup-codex-hooks.mjs install` when needed, then report any
   pending host trust review in `/hooks`. Registration does not grant trust.
5. In a fresh session, confirm the selected routes point to their canonical
   personal or workspace files. Until that succeeds, distinguish configuration
   and command-output verification from delivery in the live host.

## Examples

Choose an existing package name; repeat `--skill` to select several styles:

```powershell
node "<swe-init>/scripts/setup.mjs" --global --skill my-style --check
node "<swe-init>/scripts/setup.mjs" --global --skill my-style
node "<swe-init>/scripts/setup.mjs" --global --check
```

Use `--workspace "C:/work/project"` instead of `--global` for workspace scope.
`--check` without names validates the existing routes. Writes require explicit
`--skill` selections. `GEIST_CONFIG_FILE` selects workspace configuration;
`GEIST_USER_DIR` selects personal data. Names resolve across workspace, personal,
and bundled skills, with ambiguous copies rejected.

## Completion checks

- The setup check passes and selected skill files exist at their canonical paths.
- Existing instruction files, unrelated skills, and RAG settings are preserved.
- Private style bodies and source evidence stay in the requested personal store.
- Report the config path, hook registration, pending trust, and whether fresh
  session delivery has been confirmed. Changes require a new session.
