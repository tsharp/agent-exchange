---
name: swe-author
description: Create or refine SWE skills from the user's requirements, interviews, and representative engineering work. Use for authoring engineering practices, language styles, communication rules, or engineering workflows; activating existing packages is separate setup work.
metadata:
  version: 1.0.0
  updated: 2026-10-14
  status: stable
---

# Author SWE skills

## Overview

Turn the user's engineering choices into focused, independently installable
skills. This workflow supplies authoring guidance without prescribing anyone's
personal engineering style. It covers new packages and changes to existing ones.

Personal packages belong in `~/.geist/skills/<name>/`, where `GEIST_USER_DIR`
overrides `~/.geist`. Keep personal interviews and proposals under that store's
`docs/` and representative implementation evidence under `samples/`. Project-owned
skills belong in the requested workspace skill directory. Public plugin skills
contain reusable workflows, never private prescriptions or source evidence.

## Steps

1. **Establish the contract.** Identify what requests should trigger the skill,
   its intended reader, the behavior it governs, and its destination. Inspect an
   existing package before refining it. Reuse the package that owns a rule;
   create a new skill when it has a distinct scope. Read applicable project
   instructions and personal styles before authoring.

2. **Collect relevant evidence.** Start with explicit requirements and existing
   confirmed rules. For personal style work, consult relevant interviews,
   proposals, and representative samples in the personal store. Inspect only
   material needed for the requested scope. Ask focused questions where a real
   choice remains unclear; continue independent work while answers are pending.
   Missing samples do not prevent recording an explicit user requirement.

3. **Separate decisions from interpretations.** Treat the user's direct
   requirements as confirmed within their stated scope. Treat patterns inferred
   from code, prior agent explanations, or a single example as candidates. Record
   unresolved interpretations in a proposal under the owner's `docs/`, with
   evidence, rationale, and the decision needed. Present concrete candidate
   rules for confirmation before putting them into an active skill. Do not ask
   again for choices the user has already explicitly made, or promote candidates
   because the user has not replied.

4. **Write the package.** Use a lowercase hyphenated directory name matching the
   frontmatter `name`, a concise `description` naming its triggers, and version,
   update date, and status under `metadata`. Include `agents/openai.yaml` with
   `interface.display_name` and `interface.short_description`. Keep purpose,
   essential rules or steps, and completion checks in `SKILL.md`. Put substantial
   conditional guidance in references inside the package and state when to read
   each reference. Keep policies, assets, and scripts with their owning skill;
   links must not depend on another installed skill or private evidence. Include
   scripts only when repeated mechanics warrant them.

   State observable behavior and useful alternatives to prohibited behavior.
   Distinguish requirements from preferences and explain non-obvious reasons.
   Preserve stable rule identifiers and confirmed choices when refining a skill.
   Avoid generic advice, duplicate rules, inferred universal requirements, and
   personal prescriptions in public packages. A skill may combine with general
   and language-specific styles without copying their rules.

5. **Validate the result.** Check metadata, internal links, reference routing,
   scope, and independence from the source evidence. Run the owning repository's
   skill validator and relevant checks when available; report unavailable checks
   plainly. Run any added or changed scripts. Review a realistic in-scope request
   and a nearby out-of-scope request against the description and instructions.
   For refinements, also check the requested change and a previously confirmed
   rule for unintended changes. Distinguish manual review from executed checks;
   structural validation alone does not prove agent behavior.

6. **Deliver and activate within scope.** Report the canonical path, confirmed
   changes, pending proposals, and verification. Authoring alone does not change
   startup routing. When activation is requested, use the existing `swe-init`
   workflow if available; otherwise explain the required configuration step.
   Selected packages are configured through `[instructions].skills`; do not copy
   skill bodies into instruction files. Verify delivery in a fresh session before
   claiming the host has loaded a new route. Follow the owning repository's
   commit requirements and keep unrelated changes out of the commit.

## Examples

> Create a SWE testing skill from these projects. Interview me where the
> examples leave choices unclear.

Inspect the relevant tests and owner statements, propose inferred choices for
confirmation, then package the accepted guidance in the personal store. Keep
unresolved proposals outside routed instructions.

> Add these explicitly listed banned words to my communication skill.

Update the owning package with the stated entries and useful alternatives.
Preserve existing confirmed rules and exceptions; do not invent extra bans.

> Create a project skill for our release workflow using this runbook.

Capture the runbook's triggers, steps, and completion criteria in a workspace
package. Authoring the workflow does not authorize performing a release.

## Completion checks

- The package has a clear trigger, owner, canonical destination, and scope.
- Active prescriptions are explicit requirements or confirmed interpretations;
  unresolved candidates remain in proposals outside instruction routing.
- Personal rules and source evidence remain outside public plugin directories.
- Metadata and package-local references are valid, and the package can be
  installed independently of the evidence used to author it.
- Relevant checks and scenario reviews are reported with their actual limits.
- Existing rule identifiers and unrelated confirmed behavior are preserved.
- Routing changes and fresh-session delivery are reported only when performed
  and verified; pending activation is stated plainly.
