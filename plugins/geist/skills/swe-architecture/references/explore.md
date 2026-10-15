# Explore the selected candidate

Begin with the selected candidate's evidence and the user's goal. Read the code
needed to answer factual questions before asking the user. Reuse established
constraints and decisions; choose the next consequential uncertainty rather than
running a fixed questionnaire. Challenge a proposal with a concrete failure or
change scenario, and explain the smallest useful correction.

Work through these decisions as they become relevant:

- What behavior and compatibility obligations must survive? Which change should
  become easier, and what evidence would show the refactor paid off?
- Who owns each invariant, state transition, failure decision, and dependency?
  What moves behind the interface, and what remains with callers or composition?
- Which dependencies are in-process, locally substitutable, remote owned, or
  truly external? Which adapter, emulator, fake, or contract check fits the risk?
- What must callers know about ordering, configuration, errors, performance,
  cancellation, and resource lifetime? Explore contrasting interface alternatives
  when the choice is consequential; compare them on caller burden, locality,
  testability, and migration cost before selecting one.
- Which existing tests protect externally meaningful behavior? Add replacement
  coverage before retiring tests made redundant by consolidation.

Ask focused questions with a recommendation and its consequence. Keep accepted
answers separate from unresolved options. Refine the before/after model as choices
settle. Record newly accepted domain terminology in the project's established
glossary when documentation edits are authorized. Respect ADRs; when rejection
reveals a durable, non-obvious constraint, offer to record it in the established
decision format. Ephemeral priority decisions need no ADR.

Finish when ownership, interface obligations, dependency treatment, migration,
and verification are concrete enough to implement, or the evidence supports
rejecting or deferring the candidate. Summarize the agreed design and remaining
uncertainties. A selected candidate authorizes exploration, not code changes.
