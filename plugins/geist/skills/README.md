# Geist skills

Geist ships `swe-init`, a reusable workflow for routing selected style skills
through standard startup instruction injection. It contains no personal style
prescriptions, interview transcripts, or sample projects.

Keep personal packages in `~/.geist/skills/<name>/SKILL.md` (or
`GEIST_USER_DIR/skills`). Workspace packages can use `.agents/skills`,
`.github/skills`, or `skills`. Each package remains independently installable;
keep its references and policies inside its directory.

Use [swe-init](swe-init/SKILL.md) to activate existing packages. Creating or
refining personal rules is separate authoring work: review the user's evidence,
confirm candidate interpretations, and update the owning private package.

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
