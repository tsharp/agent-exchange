# Geist hook reference

Geist bundles lifecycle hooks for ordered workspace instructions, automatic document retrieval, and an optional external controller. Its original hooks were ported from `tsharp/geist` at commit `4e35040`, with conversation capture removed.

For installation, project setup, and environment variables, see [Geist configuration and usage](../README.md).

[hooks/hooks.json](./hooks.json) contains the Codex definitions. Codex 0.153.4 skips hooks for portable plugins; use the [user-hook registration workaround](../README.md#openai-codex-cli) until the host supports their discovery. The registration uses absolute, shell-quoted runner paths and leaves trust review to Codex. Copilot's plugin manifest selects [copilot-hooks.json](./copilot-hooks.json). Bundled plugin commands use the installed plugin's `PLUGIN_ROOT`, with separate Windows commands.

Host contracts are documented in the [Codex hook documentation](https://learn.chatgpt.com/docs/hooks) and [Copilot hook reference](https://docs.github.com/en/copilot/reference/hooks-reference).

| Lifecycle point | Codex | Copilot CLI |
| --- | --- | --- |
| Session starts | `SessionStart` | `sessionStart` |
| Prompt prepared | `UserPromptSubmit` | `userPromptTransformed` |
| Subagent starts | `SubagentStart` | `subagentStart` |
| Subagent stops | `SubagentStop` | `subagentStop` |
| Agent turn stops | `Stop` | `agentStop` |
| Session ends | `SessionEnd` | `sessionEnd` |
| Context compaction | `SessionStart` with `source: compact` | `preCompact` |

## Processing order

The runner normalizes the host payload, loads configured workspace instructions at startup events, runs additional in-process stages, calls the optional external controller, and finally processes automatic RAG when enabled. It then emits one JSON object using the host's output format. A block decision stops the remaining pipeline stages. RAG runs last so blocked or failed processing cannot mark hints as delivered. Controllers receive the earlier accumulated context; it does not include the built-in RAG result. The runtime does not write conversation logs.

Workspace instructions are injected only at `SessionStart` and `SubagentStart`. See [workspace configuration](../README.md#configure-workspace-instructions) for file selection and override behavior.

The built-in RAG stage searches through a subprocess with a configured deadline, returns bounded document hints, and fails open. Its model is prepared outside hook execution. See [document retrieval](../README.md#enable-document-retrieval). The optional `ragContextStage` helper remains available for custom in-process retrievers; the default flow requires no custom controller or pipeline definition.

Automatic delivery uses `session_id` (Codex) or `sessionId` (Copilot), accepts either spelling, and isolates state by host and record root within the workspace. Only emitted document IDs/versions are saved under `.geist/cache/rag/sessions/`, using hashed filenames and a process lock. Retrieval ranks before deduplication; unseen lower-ranked records do not fill gaps. Character-budget exclusions are not marked delivered. Session start resets state except for `source: resume`; session end removes it. Codex `source: compact`/`clear` and Copilot `preCompact` make hints eligible on the next prompt. Subagent and turn-stop events leave the parent state intact.

Copilot's `userPromptTransformed` maps to the runner's normalized `UserPromptSubmit` event. The runner preserves `transformedPrompt` and appends bounded hints through `modifiedTransformedPrompt`; it returns `{}` when no context is added. Command-hook output from Copilot `userPromptSubmitted` is ignored by the host, so that event is not configured for injection. `preCompact` performs metadata cleanup only and emits `{}`. These contracts follow the [Copilot hook reference](https://docs.github.com/en/copilot/reference/hooks-reference); Codex resets follow its [SessionStart contract](https://learn.chatgpt.com/docs/hooks#sessionstart).

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
