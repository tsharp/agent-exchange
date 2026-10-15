# Geist skills

Geist ships these reusable workflows:

| Skill | Use for |
| --- | --- |
| [swe-author](swe-author/SKILL.md) | Creating or refining SWE skills from requirements and evidence |
| [swe-init](swe-init/SKILL.md) | Routing selected existing skills through startup instruction injection |
| [refine-with-docs](refine-with-docs/SKILL.md) | Refining ideas, plans, requirements, processes, and drafts through an interview and evolving docs |
| [swe-diagnose](swe-diagnose/SKILL.md) | Reproducing a software failure, investigating its cause, and verifying a correction |
| [swe-prototype](swe-prototype/SKILL.md) | Resolving a concrete engineering or UI question with a small experiment |
| [swe-review](swe-review/SKILL.md) | Reviewing requested behavior and confirmed standards in one actionable report |
| [swe-retro](swe-retro/SKILL.md) | Proposing evidence-backed improvements after significant work or recurring friction |

These contain no personal style prescriptions, interview transcripts, or sample
projects.

Keep personal packages in `~/.geist/skills/<name>/SKILL.md` (or
`GEIST_USER_DIR/skills`). Workspace packages can use `.agents/skills`,
`.github/skills`, or `skills`. Each package remains independently installable;
keep its references and policies inside its directory.

Use `swe-author` to define scope, review the user's evidence, confirm candidate
interpretations, and validate the owning package. Explicit user requirements
can be recorded directly; inferred preferences remain proposals until confirmed.
Use `swe-init` to activate existing packages when requested. Authoring a skill
does not activate it.

For a new SWE kit, `swe-author` recommends authoring `swe-communication-style`
and `swe-style` first. Their content comes from the user's requirements and
confirmed preferences; personal rules are not bundled with Geist. Language
packages are added according to the user's work.

Use `refine-with-docs` when the user needs help clarifying a subject with written
outcomes. It uses focused question rounds, concrete examples, and updates to a
working document. It supports subjects beyond engineering and can establish
accepted choices before `swe-author` packages them. It does not require other
installed skills or activate routes.

The engineering workflows follow the communication, general engineering, and
language styles selected by active instructions. They keep personal rules in
their canonical packages and scale investigation and artifacts to the task.
Use diagnosis for a reported failure and a prototype for an uncertainty best
answered experimentally. Neither is a prerequisite for routine implementation.
Use review to assess a change against requirements and confirmed standards; use
a retrospective when requested to improve the workflow from observed friction.
These packages do not require an issue tracker, extra approval rounds for routine
choices, or mandatory agent orchestration. They retain distinct names from the
upstream skills so the chosen workflow is explicit.
Their upstream MIT notices are retained inside each independently installable
adapted package. The plugin README records [skill provenance](../README.md#skill-provenance),
including the pinned upstream version and revision, adapted versions, and changes
to each workflow.

Geist injects each configured skill's description and canonical file path at
session and subagent startup. The agent reads applicable skill bodies and their
task-relevant references. Interviews, samples, and proposals are excluded unless
explicitly requested as authoring evidence. This is model-followed routing;
installing a package alone does not activate startup routing or guarantee that
it appears in the host's skill picker.

Public plugin skills stay immediately beneath `skills/`, with matching directory
and frontmatter names and display metadata. The public maintenance contract is
in [style storage and maintenance](../docs/swe-kit/README.md). See the
[configuration guide](../README.md#style-skills) and run `npm test` after changes.
