# Geist hook reference

Geist bundles six lifecycle hooks, workspace instruction loading, and an optional external controller. The implementation was ported from `tsharp/geist` at commit `4e35040` (`C:/workspaces/ai_tools/geist`), with conversation capture removed.

For installation, project setup, and environment variables, see [Geist configuration and usage](../README.md).

Codex discovers [hooks/hooks.json](./hooks.json) automatically. Copilot's plugin manifest selects [copilot-hooks.json](./copilot-hooks.json). Both call the bundled runner using the installed plugin's `PLUGIN_ROOT`, with separate Windows commands.

Host contracts are documented in the [Codex hook documentation](https://learn.chatgpt.com/docs/hooks) and [Copilot hook reference](https://docs.github.com/en/copilot/reference/hooks-reference).

| Lifecycle point | Codex | Copilot CLI |
| --- | --- | --- |
| Session starts | `SessionStart` | `sessionStart` |
| Prompt submitted | `UserPromptSubmit` | `userPromptSubmitted` |
| Subagent starts | `SubagentStart` | `subagentStart` |
| Subagent stops | `SubagentStop` | `subagentStop` |
| Agent turn stops | `Stop` | `agentStop` |
| Session ends | `SessionEnd` | `sessionEnd` |

## Processing order

The runner normalizes the host payload, loads workspace instructions, runs any in-process stages, and calls the optional external controller. It then emits one JSON object using the host's output format. A block decision stops the remaining pipeline stages. The runtime does not write conversation logs.

Workspace instructions are injected only at `SessionStart` and `SubagentStart`. See [workspace configuration](../README.md#configure-workspace-instructions) for file selection and override behavior.

## External controller protocol

The `GEIST_HOOK_CONTROLLER` environment variable accepts a JSON object:

```json
{
  "command": "node",
  "args": ["C:/agent-control/controller.mjs"],
  "events": ["UserPromptSubmit", "Stop"],
  "required": false,
  "timeoutMs": 4000
}
```

The controller runs directly without a shell. It receives one JSON object on stdin containing `protocol_version: 1`, `request: { host, event, input, workspace }`, and `accumulated: { instructions, context }`. It can return:

```json
{
  "skills": ["my-local-skill"],
  "context": ["Retrieved reference information"],
  "decision": "allow"
}
```

Named skills resolve from the workspace's `.agents/skills`, `.github/skills`, and `skills` directories, plus this plugin's `skills` directory. Unknown or ambiguous names fail the response. Skill bodies become instructions; reference context is explicitly marked as untrusted data.

At `Stop` or `SubagentStop`, a controller can return `decision: "block"` with a nonempty `reason` to request another turn. Controllers must enforce a finite continuation budget and respect the host's active-stop marker. With `required: false`, controller failure logs a diagnostic and allows the hook to continue; `required: true` fails the hook. No configured controller is a successful no-op. The timeout is capped at 4.5 seconds and output at 64 KiB.

Controllers receive session data, so configure a trusted executable. Keep slow retrieval and model calls outside hooks. The optional `ragContextStage(retriever)` in `src/hooks/stages/rag-context.ts` supports an in-process retrieval adapter that adds reference context at prompt submission and continues on retrieval failure.

## Development

See [Develop Geist](../README.md#develop-geist) for build and test commands. Keep handlers within their configured deadlines, parse stdin as JSON, and emit at most one final JSON object on stdout. Use stderr for diagnostics. Add focused fixtures when changing host behavior or configuration.
