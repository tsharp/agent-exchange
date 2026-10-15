# Architecture report contract

The agent investigates source and writes the survey. The bundled script validates
structure and references, then renders an offline HTML Architecture report. It
does not infer architecture from filenames or verify factual claims. Requires
Node.js 22.18 or newer, with no npm dependencies or sibling skills.

```text
node <skill-directory>/scripts/generate-report.mjs <survey.json> [new-report.html]
```

Quote paths containing spaces. Use fresh files in the OS temporary directory
unless the user requests another destination. The optional HTML output must have
an existing parent. Without it, the script chooses a unique temporary filename
and prints its absolute path. Existing files are never replaced. Invalid input
exits nonzero before writing. Retain the JSON beside the HTML when practical.
Inspect the rendered report at desktop and narrow widths, including diagrams,
navigation, terminology tables, and evidence expansion. State unavailable checks.

## Schema version 1

All fields below are required; arrays may be empty unless specified. Every text
field is nonempty. Empty collections mean no entries were established; explain
missing evidence in coverage and limits. Unknown extra fields are ignored.

| Field | Value |
| --- | --- |
| `schemaVersion`, `kind` | `1`, `"architecture-survey"` |
| `project`, `purpose`, `summary` | Name, system purpose, architectural synopsis |
| `scope`, `scopeType` | Surveyed area; `repository` or `section` |
| `revision`, `worktree` | Inspected revision; `clean`, `dirty`, `unknown`, or `not-git` |
| `inspected` | Nonempty array of inspected paths and relevant commands/results |
| `excluded`, `limits`, `questions` | Arrays of exclusions, evidence limits, and unresolved questions |
| `coverage` | Exactly one `{dimension, status, reason}` per dimension below |
| `domains`, `domainRelations` | Responsibilities and their contextual relationships |
| `components`, `externals`, `dependencies`, `layers` | Implementation ownership and directed relationships |
| `views`, `flows` | Architecture maps and representative runtime/data flows |
| `glossary`, `ambiguities`, `decisions` | Contextual language, contradictions, and consequential decisions |

Coverage dimensions: `System context`, `Domains and terminology`, `Components and
layers`, `Dependencies`, `Runtime flows`, `Decisions`. Status is `assessed`,
`unexamined`, or `inapplicable`. Nonempty collections require assessed coverage
for their dimension. At least one architecture view or an explicit limit is
required. Mark a partial survey rather than pretending empty collections prove
there are no domains or dependencies.

All evidence-bearing items use `evidence`: a nonempty array of
`{path, line, detail}` with source path, positive integer line, and observed
behavior or definition. Domains, domain relations, components, externals,
dependencies, layers, views, and flows also have `basis`: `observed` or `inferred`.
For an inference, explain the reasoning and uncertainty in the evidence detail.

## Collections

IDs are unique lowercase hyphenated identifiers, starting with a letter. Domain
IDs and component/external IDs have independent namespaces; component and
external IDs cannot overlap. References must resolve within the survey.

| Collection | Item fields, in addition to evidence and basis where applicable |
| --- | --- |
| `domains` | `id`, `name`, `responsibility`, `classification` (`business`, `technical`, `supporting`), `paths` array |
| `domainRelations` | `from`, `to` domain IDs; `relationship` text |
| `layers` | `name`, `responsibility`, `allowedDependencies` array of declared layer names, `enforcement` text |
| `components` | `id`, `name`, `responsibility`, `domainIds` array, `layer` (declared name or `unknown`), `paths`, `interfaces`, `data` arrays |
| `externals` | `id`, `name`, `role`; external means outside the surveyed boundary, including other repository components in a section report |
| `dependencies` | `from`, `to` component/external IDs; `kind` (`compile`, `runtime`, `data`, `event`); `relationship` text |
| `views`, `flows` | `title`, `description`, `diagram` object |
| `glossary` | `term`, `domainId`, `definition`, `aliases`, `codeNames`, `status` (`established`, `inferred`, `proposed`); evidence, no basis field |
| `ambiguities` | `term`, `contexts` array of domain IDs, `description`, `question`; evidence, no basis field |
| `decisions` | `title`, `decision`, `consequence`, `status` (`documented`, `observed`, `proposed`); evidence, no basis field |

Empty allowedDependencies means none were recorded, not automatically that none
are permitted. State missing policies in `enforcement` and coverage. A scoped
term is unique within a domain; the same spelling may have different meanings
in different domains. Established terminology and documented decisions require
authoritative source evidence, not just an implementation symbol.

## Diagrams

Each diagram has nonempty unique `nodes` (text labels), `edges` (directed
`[fromLabel, toLabel]` pairs referencing those labels), and `meaning` (arrow
semantics and scope). Optional `layout` is `flow` (default) or `layers`.
`layers` renders nodes top to bottom. Optional `emphasis` names existing owner
nodes. Optional `problemEdges` names existing edges that represent observed
contradictions; they render red. Use concise labels and small representative
views rather than one illegible repository graph. View descriptions and evidence
must distinguish observed facts from inferred relationships. These are current
system diagrams, with no before/after or proposed target implied.

The report includes system maps, domain cards and relationships, component and
layer ownership, directed dependencies, runtime flows, a contextual glossary,
ambiguities, decisions, open questions, and explicit coverage. It escapes input,
uses native expandable source evidence, and works offline without JavaScript.
Generate `assets/example-survey.json` for a reproducible synthetic preview.
