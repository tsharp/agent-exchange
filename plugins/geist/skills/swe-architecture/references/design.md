# Design lenses

Use the project's terminology. A module is a responsibility with an interface
and implementation, at whatever scale the evaluation needs. Its interface
includes invariants, ordering, errors, configuration, and performance obligations,
as well as callable signatures. A deep module hides substantial behavior behind
a manageable interface. Depth is not a ratio of line counts.

Assess these dimensions, with evidence for each conclusion:

- **Module depth:** do callers learn less complexity than the module hides?
  Apply the deletion test: if removal makes complexity disappear, the module may
  be a pass-through; if complexity spreads into callers, it earns its place.
  Account for adapters, policy enforcement, and compatibility before recommending
  removal. Neither large implementations nor many small files prove shallowness.
- **Change locality:** can a maintainer change one domain decision and verify it
  in one place? Trace repeated knowledge and edits across callers.
- **Dependency direction:** compare observed edges and cycles against the
  project's declared layers, permitted dependencies, and enforcement mechanisms.
- **Boundary ownership:** identify responsibility, state and invariant ownership,
  infrastructure isolation, and composition. Explain what belongs inside a
  proposed module and what remains outside, without prescribing folder names.
- **Testability:** can tests exercise meaningful outcomes through the interface
  used by callers? Identify coverage lost or preserved by a proposed consolidation.
  Retire redundant tests only after replacement coverage protects their behavior.

Classify dependencies when explaining verification: in-process behavior can be
tested directly; locally substitutable infrastructure may use an emulator; remote
owned systems and third-party systems may need adapters and contract checks.
Choose doubles according to the behavior at risk and available infrastructure.
An adapter count alone neither justifies nor forbids an interface. Explain the
current variation, isolation, compatibility, or ownership requirement it serves.
