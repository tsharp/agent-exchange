# Domain and terminology lenses

A domain describes a coherent area of knowledge and responsibility. A context
gives terms their specific meaning. A package, service, folder, layer, or process
is implementation evidence, not proof of a separate domain or bounded context.
Some repositories primarily implement technical capabilities; describe those
honestly instead of inventing business domains.

Read the existing glossary map first when there are multiple contexts, then the
relevant glossaries and decisions. Respect documented meanings while checking
them against behavior. Where no domain documentation exists, infer a candidate
model from use cases, invariants, contracts, data ownership, and interactions.
Label this model inferred. A repository survey does not establish a new domain
model simply by naming it.

For each domain or capability, explain its responsibility, owned concepts and
data, relationships to other areas, and implementation evidence. Classify it as
business, technical, or supporting when useful. Separate conceptual ownership
from the layer or process that executes it. Show cross-context communication,
shared concepts, and translation between different meanings.

For each term, give a short semantic definition in its context. Keep source
identifiers in a separate code-names field. Include project-specific concepts,
not a catalog of generic programming vocabulary. Distinguish:

- **Established:** a definition recorded in authoritative project documentation
  and checked against behavior. Explain contradictions rather than choosing
  silently between sources.
- **Inferred:** the meaning suggested by inspected behavior without a confirmed
  domain definition.
- **Proposed:** a suggested canonical name or clarified meaning that still needs
  an owner decision. Keep observed aliases and why they cause ambiguity visible.

One spelling may mean different things in different contexts; record separate
definitions and the distinction. Multiple spellings may mean the same concept;
record aliases without declaring them forbidden unless the project does so.
Use concrete scenarios to expose ambiguity: partial cancellation, repeated
delivery, deletion versus archival, or ownership transfer, as the domain warrants.

Keep decisions factual and scoped. A constraint implemented in code is not
automatically an accepted ADR. If documentation refinement is requested later,
capture accepted definitions in the established glossary and offer an ADR only
for a hard-to-reverse, surprising decision involving a real tradeoff. Retain
the report's unresolved terminology as proposals until confirmed.
