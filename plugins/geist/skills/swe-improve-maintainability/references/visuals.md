# Visual review experience

The report is a visual explanation of candidate changes. Put the explanation
in the before/after comparison, with short problem and solution sentences and
specific wins. Keep source evidence, migration costs, decisions, and verification
available in expandable details. Coverage belongs after the recommendations.

The bundled renderer supplies warm stone backgrounds, editorial headings,
generous spacing, monospaced file names, strength and dependency badges,
colored problem edges, dark responsibility owners, ADR callouts, candidate
navigation, and a linked top recommendation. Use concise labels and a small
representative subgraph; split a crowded diagram into separate candidates only
when they represent independent decisions. Inspect the rendered result at a
desktop and narrow width. If an explanation relies on a paragraph to decode
the visual, simplify the visual.

Choose `layout` for each side of a candidate independently:

| Layout | Use when | Data beyond nodes, edges, meaning |
| --- | --- | --- |
| `flow` (default) | Dependency direction, caller fan-out, repeated coordination | Optional `emphasis` node labels and `problemEdges` drawn red |
| `layers` | A request crosses several thin responsibilities | Optional `emphasis` marks costly steps; node order is top to bottom |
| `collapse` | Several responsibilities become private to one owner | `label` names the owner, `interface` describes the caller contract; nodes name the internals |
| `depth` | Callers learn too much relative to hidden behavior | `label` names the implementation responsibility, `interface` lists caller obligations; nodes describe hidden behavior |

Depth bands are qualitative illustrations, not measurements or line-count ratios.
Flow edges mean exactly what `meaning` states. For layers, nodes are ordered
bands; for collapse and depth, nodes are contained responsibilities. Preserve
the explicit edge list for any relationships not apparent in those illustrations.
Before always depicts inspected behavior; after is always a proposal.

Use `wins` for a few short, specific gains, `dependency` for the dependency
category, and `adrConflict` only for an actual decision conflict worth revisiting.
Set `topFinding` to the recommended candidate's zero-based index. Findings should
normally be ordered by priority. Do not manufacture findings to fill the layout.

For a reproducible, explicitly synthetic visual example, run the generator with
the owning package's `assets/example-assessment.json` as input. This demonstrates
the layouts; it is not an evaluation of the consuming repository.
