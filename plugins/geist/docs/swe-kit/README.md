# Style storage and maintenance

Agent Exchange is a public marketplace. Geist owns the reusable routing and
setup mechanism; consuming users own their style prescriptions and evidence.

## Storage boundary

| Location | Content | Startup behavior |
| --- | --- | --- |
| Plugin `skills/swe-init/` | Generic configuration workflow and setup script | Used when setting up or repairing routes |
| Plugin `skills/swe-author/` | Generic SWE skill authoring workflow | Used when creating or refining packages |
| Plugin `skills/refine-with-docs/` | General refinement interview and documentation workflow | Used when clarifying a subject with written outcomes |
| `~/.geist/skills/<name>/` | Personal skill, references, and lint policies | Routed only when selected in `instructions.skills` |
| `~/.geist/docs/` | Personal interviews and proposals | Outside instruction routing |
| `~/.geist/samples/` | Personal implementation evidence | Outside instruction routing |
| Workspace skill directories | Project-owned skills | Routed when configured |

`GEIST_USER_DIR` overrides the personal root. Keep one canonical copy of each
skill; duplicate names across workspace, personal, and bundled roots fail as
ambiguous unless they resolve to the same physical file. Personal data must not
be copied into the public plugin during setup or builds.

## Applying and authoring styles

Use `swe-init` to select existing packages for global or workspace startup
routing. No personal style names or rules are built into the script. Geist
injects scopes and canonical paths, and the agent reads applicable files.
Global configuration precedes workspace configuration, preserving TOML order.

Use `swe-author` to create or refine SWE packages. For style authoring, review
the user's representative samples and statements, record candidate
interpretations as proposals, and confirm them before changing
stable prescriptions. Preserve rule identifiers and owner-confirmed choices.
Keep evidence separate from active instructions, supporting references inside
the owning skill, and a single canonical `skills/` source in the personal store.
Explicit user requirements are already confirmed; inferred preferences remain
proposals until accepted. Validate the package before handing off to `swe-init`
for requested activation. Authoring alone does not change startup routing.

The recommended starting set for a new kit is `swe-communication-style` and
`swe-style`. These names identify authored communication and general engineering
packages; their rules come from the consuming user. Add language packages when
needed. Recommendations do not add defaults to setup code or activate routes.

Use `refine-with-docs` for an adaptive interview with evolving documentation,
including subjects outside SWE. Check concrete scenarios and source authorship,
record accepted decisions as they settle, and keep unresolved interpretations
visible. It can prepare accepted choices for `swe-author` without requiring skill
creation, a glossary, or formal decision records for every subject.

Engineering workflows such as `swe-diagnose` and `swe-prototype` apply the styles
selected by active instructions. Their public packages contain reusable task
steps and upstream attribution, not personal prescriptions. Keep the two core
authored styles as the starting recommendation; workflows do not add themselves
to startup routing or require tracker setup. Each adapted package retains its
upstream license so it can be installed independently.

## Verification

Run `npm test` from the marketplace root after changing configuration, skills,
or tooling. Rebuild with `npm run build` after hook or setup source changes.
Tests use synthetic styles in isolated personal stores, exercise both host
adapters, and check setup preservation, ambiguity failures, and bundled output.
Real personal samples and lint policies are validated in their owning store.

See the [skills index](../../skills/README.md) and
[configuration guide](../../README.md#style-skills).
