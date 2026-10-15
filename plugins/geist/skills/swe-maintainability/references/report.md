# Scripted report contract

The agent evaluates source code and writes structured evidence. The generator
validates that evidence's shape and renders it; it does not scan code, verify
claims, or calculate a maintainability score. Requires Node.js 22.18 or newer,
with no npm installation or other skill needed.

Run from any directory, resolving the script from the installed skill directory:

```text
node <skill-directory>/scripts/generate-report.mjs <assessment.json> [new-report.html]
```

Quote paths containing spaces. Write assessment JSON to a fresh file in the OS
temporary directory unless the user requested another location. The optional
output is a new HTML file whose parent already exists. Without it, the generator
uses the OS temporary directory with a timestamp and unique suffix. It prints the
absolute report path. Existing files are never replaced; invalid input exits
nonzero before writing. The report uses inline CSS and static visuals, works
offline, escapes input text, and executes no scripts. Open the result with the
available local browser or document viewer and inspect scope, coverage, findings,
and layout before delivering it. Report any inability to inspect the rendering.
Keep the assessment JSON available beside the report when practical for reuse.

## Input schema, version 1 (backward compatible)

All fields below are required. Text fields must be nonempty. Empty arrays are
allowed unless noted. JSON property order is immaterial; findings render in
input order, highest priority first. Unknown extra fields are ignored.

| Field | Value |
| --- | --- |
| `schemaVersion` | `1` |
| `kind` | `"maintainability"` |
| `project`, `scope` | Project name and evaluated scope |
| `revision` | Inspected commit, or explanation when unavailable |
| `worktree` | `clean`, `dirty`, `unknown`, or `not-git` |
| `summary` | Overall assessment, distinguishing partial coverage |
| `inspected` | Nonempty array of inspected paths and relevant commands/results |
| `excluded` | Array of excluded areas |
| `strengths` | Array of evidence-backed design choices to preserve |
| `limits` | Array of unavailable evidence and verification limits |
| `coverage` | One object per evaluation dimension, exactly once |
| `findings` | Array of finding objects; may be empty |
| `recommendation` | First justified action and why, or why no action is justified |

Each coverage object has `dimension` matching an evaluation dimension in
SKILL.md, `status` (`assessed`, `unexamined`, or `inapplicable`), and `reason`
explaining the evidence or limitation. Findings must belong to assessed dimensions.

Each finding requires these fields:

| Field | Value |
| --- | --- |
| `title`, `dimension` | Short title and matching evaluation dimension |
| `strength` | `Strong`, `Worth exploring`, or `Speculative` |
| `basis` | `observed` or `inferred` |
| `evidence` | Nonempty array of `{ "path": "relative/source.file", "line": 12, "detail": "observed behavior" }`; line is a positive integer |
| `observation` | What inspected code does; qualify an inference |
| `consequence` | Concrete maintenance/change scenario and cost |
| `proposal` | Proposed improvement, distinct from current behavior |
| `benefits` | Expected improvement to callers, maintainers, or tests |
| `tradeoffs` | Migration, compatibility, and complexity costs |
| `verification` | How to prove the improvement preserves required behavior |
| `decisions` | Relevant decisions, conflicts, or a statement that none were found in the inspected scope |

Strong recommendations have direct evidence and a clear payoff. Worth exploring
recommendations have supporting evidence but unresolved tradeoffs. Speculative
recommendations state the uncertainty and what evidence would resolve it. Do not
include speculative candidates merely to populate a report.

## Visual presentation fields

Optional fields preserve compatibility with version 1 inputs:

- `topFinding`: zero-based index of the top recommendation; defaults to the first finding. Omit for an empty evaluation.
- Finding `wins`: nonempty array of short gains; `dependency`: `in-process`, `local-substitutable`, `ports & adapters`, or `mock`; `adrConflict`: text explaining a decision conflict that deserves attention.
- Diagrams accept `layout`: `flow`, `layers`, `collapse`, or `depth`; defaults to `flow`. `collapse` and `depth` require nonempty `label` and `interface`. Optional `emphasis` lists existing node labels, and `problemEdges` lists existing directed edge pairs.

Read [the visual guide](visuals.md) when preparing report inputs. Before/after
diagrams are required for architecture findings. For maintainability findings
they are optional in the schema; supply both when using either. Use them for
the main findings so the maintenance cost and improvement are visible.

The report foregrounds candidate comparisons, concise problem/solution text,
colored strength and dependency badges, specific wins, ADR warnings, and a
linked top recommendation. Detailed evidence and coverage remain accessible
in native expandable sections. The report works offline without JavaScript.
Use the package-local `assets/example-assessment.json` to generate a synthetic
preview with multiple visual patterns.
