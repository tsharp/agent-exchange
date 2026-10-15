---
name: swe-retro
description: Review an engineering session or repeated workflow friction and propose evidence-backed improvements to tools, checks, navigation, and guidance. Use for a requested retrospective; do not add a retrospective to every task.
metadata:
  version: 1.0.0
  updated: 2026-10-15
  status: stable
---

# Improve the engineering workflow

## Overview

Find a small number of changes that would prevent demonstrated mistakes or
reduce repeated effort. Read the applicable communication, general engineering,
and language styles selected by active instructions and their relevant
references. Preserve confirmed preferences; an incident does not establish a
new personal rule.

Use the current session unless the user names another scope. A retrospective
is useful after recurring friction or significant work, not as a mandatory
closing ceremony. No findings is an acceptable result.

## Steps

1. **Review the evidence.** Inspect the scoped conversation, changes, checks,
   and relevant repository configuration. Use a specified session artifact when
   available; avoid broad searches of unrelated private conversations. Identify
   what actually went wrong or consumed effort and what already worked. Separate
   observed failures from plausible causes and unsupported interpretations.

2. **Find the smallest useful improvement.** Consider these only where the
   evidence points to them:

   - Navigation: a missing ownership or documentation pointer caused repeated
     searching. Fix the pointer rather than duplicating the source content.
   - Automated checks: inspect existing lint, type, test, and CI commands first.
     Repair a disconnected or misleading check before introducing another one.
     A repeatable mechanical mistake may warrant a deterministic check when
     its prevention value exceeds its maintenance cost.
   - Guidance: clarify an ambiguous rule, remove a stale or duplicate instruction,
     or route specialized material only when relevant. Keep personal preferences
     in the owning private skill, not in a public workflow or copied into every
     project. Standards guide implementation and review.
   - Tool and information access: reduce redundant calls, narrow noisy output,
     or make needed diagnostics available. Distinguish a missing capability
     from a tool that was available but used poorly.
   - Workflow: remove unnecessary questions, artifacts, repeated checks, or
     orchestration that did not improve the result. Preserve checks required
     by the repository or justified by new evidence.

3. **Assess the trade-off.** For each supported candidate, state the observed
   incident, proposed correction, expected benefit, maintenance cost, and how
   its effect could be checked. Prioritize recurring or consequential failures.
   Prefer deletion or a local correction when it solves the problem. Avoid
   creating a new skill, policy, or system for an isolated reversible mistake.
   Recommend an experiment when the cause remains uncertain.

4. **Deliver within scope.** Report the highest-value actionable candidates
   concisely, using the owner's terminology and evidence. Do not pad the report
   to meet a finding count or create a new document solely to record the ritual.
   A request for retrospective findings alone does not authorize changes to
   configuration, tooling, or active personal rules.

   If implementation is already requested, apply authorized corrections and
   validate them with relevant checks. A new inferred preference remains a
   proposal until the owner confirms it; explicit decisions already made need
   no repeated confirmation. Preserve unrelated work and follow repository
   commit requirements. Report what changed and what remains a proposal.

## Completion checks

- Findings are tied to evidence in the requested scope and distinguish causes
  from hypotheses.
- Existing tooling and authoritative guidance were checked before recommending
  additions.
- Recommendations explain their benefit, cost, and smallest practical next step.
- Proposed rules are distinguished from confirmed preferences, and public
  workflows contain no copied personal guidance or private source evidence.
- Applied changes were authorized and verified; proposals and limitations remain
  explicit. No extra process was added merely to produce a retrospective.

## Provenance

Adapted from Matt Pocock's `retro` at upstream revision `49dd158`.
The upstream [MIT notice](LICENSE) is retained with this independent package.
