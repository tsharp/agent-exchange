---
name: swe-review
description: Review a branch, commit range, or working changes against the requested behavior and applicable engineering standards. Use for code review or an authorized implementation review; ordinary edits do not require a separate review workflow.
metadata:
  version: 1.0.1
  updated: 2026-10-15
  status: stable
---

# Review engineering changes

## Overview

Assess whether the change delivers the requested behavior and follows the
applicable standards. Read the communication, general engineering, and language
styles selected by active instructions, plus their task-relevant references.
Use those confirmed rules and project requirements; upstream preferences and
generic design heuristics are not additional mandatory standards.

Keep the review proportional to the change. One focused pass can cover a small
diff. Independent passes can help for complex or high-risk changes when agent
delegation is authorized; they are not required for every review. No tracker,
new specification document, or setup workflow is a prerequisite.

## Steps

1. **Establish the comparison.** Honor the user's specified range or baseline
   and verify that it resolves. Otherwise infer scope from the request, current
   branch, working tree, and established repository conventions. State the
   comparison; ask only when different plausible scopes change the review.
   For a branch, use its merge-base with the intended target. For working
   changes, inspect staged and unstaged diffs and relevant untracked files;
   a comparison of committed revisions alone misses them. If there is no
   change to review, report that without manufacturing findings.

2. **Find the governing requirements.** Use the user's request, accepted
   conversation decisions, referenced issue or specification, and current
   caller-facing contracts. Locate relevant repository instructions, standards,
   and automated checks. Follow existing domain terms. Distinguish implemented
   behavior from intended behavior. If requirements are incomplete, report the
   limitation and continue the review that the available evidence supports.

3. **Check behavior.** Trace the changed paths and enough surrounding code to
   assess the real trigger, outputs, invariants, errors, and integration. Check
   for missing requirements, scope additions, compatibility changes, and tests
   that would pass despite incorrect behavior. Use a focused reproduction or
   existing checks where useful. Read test output and the assertions themselves;
   a green suite alone does not prove the requested behavior.

4. **Check engineering standards.** Apply confirmed style and project rules
   during assessment, including relevant language policies. Look for concrete
   problems in responsibility, dependency direction, state validity, recovery,
   visibility, and caller-facing documentation. Treat design concerns as judgment
   calls with a failure scenario, not automatic violations of a generic smell
   list. Avoid duplicating mechanical lint findings already reported by tooling.
   Apply standards during implementation as well as review.

5. **Report actionable findings.** Combine the results into one concise list
   ordered by consequence, labeling each finding as behavior, standards, or both.
   Cite the affected file and line, the requirement or rule when applicable,
   the concrete trigger and consequence, and the smallest useful correction.
   Separate demonstrated defects from uncertain concerns; do not turn preference
   differences into defects. Report no findings when none are supported.

   State checks actually run and important coverage limits, including any axis
   that could not be assessed. A review request alone does not authorize applying
   fixes. When fixes are already requested, correct supported findings and rerun
   relevant checks within that scope, preserving unrelated user work.

## Completion checks

- The comparison and included working changes are explicit and correct.
- Requested behavior and applicable standards were assessed separately before
  consolidating findings; neither was mistaken for proof of the other.
- Each reported finding has an actionable location and concrete consequence.
- Rules come from confirmed styles or project requirements; judgment calls are
  distinguished from violations.
- Verification, missing requirements, and other review limits are stated plainly.
- Any edits remain within the user's authorized scope.
