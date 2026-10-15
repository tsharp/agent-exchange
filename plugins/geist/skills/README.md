# Geist skills

Geist ships three reusable workflows:

| Skill | Use for |
| --- | --- |
| [swe-author](swe-author/SKILL.md) | Creating or refining SWE skills from requirements and evidence |
| [swe-init](swe-init/SKILL.md) | Routing selected existing skills through startup instruction injection |
| [refine-with-docs](refine-with-docs/SKILL.md) | Refining ideas, plans, requirements, processes, and drafts through an interview and evolving docs |

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
