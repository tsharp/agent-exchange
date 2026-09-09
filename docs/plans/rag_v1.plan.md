---
state: draft
version: 2026-09-08
---
# Geist RAG

The purpose of this document is to describe minimally the features needed to implement RAG for Geist.

## Data Storage

Geist stores its knowledge as records within a configured directory.

For the initial version, records are stored as Markdown files with optional YAML frontmatter. The filesystem is the canonical source of record data. Indexes, embeddings, relationship graphs, and other retrieval structures are derived from these files and may be rebuilt at any time.

### Storage Location

The default record location is:

```text
docs/
```

The storage location may be configured to use another directory.

All Markdown files contained within the configured storage location, including files in subdirectories, are considered Geist records.

For example:

```text
docs/
  architecture.md
  decisions/
    use-postgres.md
    service-boundaries.md
  constraints/
    database-access.md
  checkout/
    ownership.md
```

Directory structure has no intrinsic semantic meaning to Geist. Repositories may organize records into directories for human readability and navigation.

Semantics such as kind, state, scope, and relationships are expressed through record frontmatter rather than inferred from directory names.

### Record Format

Each Markdown file represents one record.

A record consists of:

1. Optional YAML frontmatter containing structured metadata.
2. Markdown content containing the record's human-readable information.

For example:

```md
---
kind: decision
state: active
scope:
  - service:checkout
---

# Checkout database ownership

Checkout owns and controls modifications to its transactional data.
```

Frontmatter is optional. A Markdown file containing only Markdown content is a valid record.

### Record Identity

A record is identified by its path relative to the configured storage location.

For example:

```text
docs/decisions/use-postgres.md
```

has the record identifier:

```text
decisions/use-postgres.md
```

Record paths must be unique within a storage location.

Moving or renaming a file changes its record identifier. References to the previous path may therefore need to be updated.

### Discovery

Geist discovers records by recursively scanning the configured storage location.

Files outside the configured location are not considered records.

For the initial version, only Markdown files are indexed as records.

Generated files, hidden files, or other exclusions may be introduced later if required. The initial implementation should avoid introducing exclusion rules unless they are necessary.

### Canonical and Derived Data

Markdown records are canonical.

The following are considered derived data:

- text chunks used for retrieval
- embeddings
- vector indexes
- search indexes
- relationship indexes
- backlinks
- caches
- other RAG-specific representations

Derived data may be stored locally or externally as required by an implementation, but it must be possible to recreate it from the canonical records.

Deleting derived data must not result in the loss of record knowledge.

### Source Control

The storage directory is intended to work naturally with source control.

Changes to records are ordinary file changes and may use the repository's existing branching, review, merge, and history mechanisms.

This allows architectural knowledge, decisions, constraints, facts, and other records to evolve alongside the system they describe without requiring a separate persistence system.

### Portability

Records should not depend on Geist-specific storage infrastructure to remain useful.

A repository containing its `docs/` directory should retain its human-readable knowledge even when Geist, its MCP server, its database, or its retrieval indexes are unavailable.

This also allows the same record set to be indexed by different Geist implementations or retrieval systems in the future.

## Frontmatter

Markdown records may contain optional YAML frontmatter describing the record and its relationship to other knowledge.

Frontmatter is intended to support classification, retrieval, filtering, relationship traversal, provenance, and agent reasoning. The Markdown body remains the primary content of the record.

All frontmatter fields are optional. A Markdown file without frontmatter is a valid record.

### Format

Frontmatter appears at the beginning of a Markdown record between YAML delimiters.

```md id="yky8r0"
---
kind: decision
state: active

scope:
  - service:checkout
  - domain:commerce

links:
  - record: constraints/database-ownership.md
    kind: supports

sources:
  - date: 2026-09-08
    source: "PR 1842"
---

# Database access

Services access data owned by other services through their public
interfaces rather than directly accessing their underlying storage.
```

The supported top-level fields are:

| Field | Type | Required | Purpose |
|---|---|---:|---|
| `kind` | string | No | Classifies the knowledge represented by the record. |
| `state` | string | No | Describes the lifecycle state of the record. |
| `scope` | list of strings | No | Identifies where the record applies. |
| `links` | list of links | No | Defines relationships to other records. |
| `sources` | list of sources | No | Records provenance and supporting information. |

Unknown fields should be preserved when possible. Readers should not reject a record solely because its frontmatter contains fields they do not understand.

---

### Kind

`kind` describes what type of knowledge the record represents.

```yaml id="frkt8r"
kind: decision
```

The initial recognized values are:

| Kind | Meaning |
|---|---|
| `decision` | A choice that has been made and is relevant to future work. |
| `fact` | Something currently understood to be true. |
| `idea` | Something worth remembering, investigating, or developing further. |
| `constraint` | A restriction that must or must not be violated. |
| `preference` | An approach that should generally be favored when practical. |
| `proposal` | A concrete change or approach being considered. |
| `requirement` | Something the system, design, or implementation must satisfy. |
| `exception` | A scoped exception to another decision, constraint, requirement, or convention. |

`kind` describes semantics, not lifecycle.

For example, a decision may be proposed, active, rejected, or superseded.

The recognized vocabulary may expand over time. Consumers should tolerate unknown kinds.

---

### State

`state` describes the current lifecycle state of the record.

```yaml id="3p7kav"
state: active
```

The initial recognized values are:

| State | Meaning |
|---|---|
| `draft` | The record is incomplete or still being developed. |
| `proposed` | The record is ready for consideration but has not been accepted. |
| `active` | The record currently applies. |
| `deprecated` | The record remains relevant but should not normally guide new work. |
| `superseded` | The record has been replaced by another record. |
| `rejected` | The record was considered and explicitly not adopted. |

State is independent of kind.

An omitted state means that the record makes no explicit lifecycle assertion.

Consumers should tolerate unknown states.

---

### Scope

`scope` identifies where the record applies.

```yaml id="sjs2fm"
scope:
  - service:checkout
  - domain:commerce
```

A record may have zero or more scopes.

Scope values are strings. Geist does not require a fixed scope schema. This allows repositories and higher-level tooling to establish conventions without changing the record format.

Recommended conventions include:

| Scope | Meaning |
|---|---|
| `global` | Applies broadly across the system or repository. |
| `repo:<name>` | Applies to a repository. |
| `path:<path>` | Applies to a file or directory hierarchy. |
| `component:<name>` | Applies to a logical component. |
| `service:<name>` | Applies to a service. |
| `domain:<name>` | Applies to a business or architectural domain. |

For example:

```yaml id="pm5j8b"
scope:
  - repo

## MCP Server

Geist exposes its record system through an MCP server so agents can discover, retrieve, create, update, relate, and remove records using the same underlying storage model.

The MCP server is an operational interface over the configured record store. It does not define a separate source of truth. Markdown records under the configured storage location remain canonical.

The MCP server should remain intentionally small. Retrieval, mutation, and relationship operations are exposed directly. Higher-level behaviors such as architectural review, design analysis, policy enforcement, or software-factory workflows should be implemented by agents or specialized components built on top of these primitives.

### Responsibilities

The MCP server is responsible for:

- discovering records
- retrieving records
- searching records
- creating records
- updating records
- deleting records
- resolving relationships between records
- exposing record metadata
- allowing agents to work with records without directly manipulating the filesystem

The MCP server may use indexes, embeddings, vector search, relationship indexes, caches, or other derived structures internally.

These structures are implementation details and must remain rebuildable from the canonical record store.

### Record Identity

Records are identified by their path relative to the configured storage location.

For example:

```text
docs/decisions/use-postgres.md
```

is addressed through MCP as:

```text
decisions/use-postgres.md
```

All MCP operations that reference a record should use this relative record identifier.

### Core Tools

The initial MCP server should expose the following tools.

#### `list_records`

Returns records available in the configured record store.

The operation may optionally support filtering by:

- `kind`
- `state`
- `scope`
- path prefix

The result should include enough information to identify each record without returning the full body unless requested.

Typical returned information includes:

- record identifier
- title, when available
- kind
- state
- scope

#### `get_record`

Retrieves a single record by identifier.

The result should include:

- record identifier
- Markdown body
- parsed frontmatter
- links
- sources

The raw Markdown representation may also be returned when useful.

#### `search_records`

Searches the record corpus.

Search may combine:

- semantic/vector retrieval
- text search
- metadata filtering
- scope filtering
- relationship context

The implementation determines the retrieval strategy.

The result should return ranked record matches and enough context for an agent to decide which records should be retrieved in full.

Search results should preserve record identity so agents can subsequently call `get_record`.

#### `create_record`

Creates a new record.

The caller supplies:

- record identifier or desired path
- Markdown content
- optional frontmatter

The MCP server writes the resulting Markdown file into the configured record store.

Creation must fail if the requested identifier already exists unless explicit replacement semantics are introduced later.

#### `update_record`

Updates an existing record.

Updates may modify:

- Markdown content
- frontmatter
- links
- sources

The initial implementation may replace the complete record rather than supporting fine-grained patch operations.

After modification, any derived indexes associated with the record should be refreshed.

#### `delete_record`

Removes a record from the canonical store.

Deleting a record should also remove or invalidate its derived indexing data.

The server should not automatically delete records that link to the removed record. Existing links may become unresolved and should remain observable.

Higher-level workflows may choose to use lifecycle states such as `superseded` or `rejected` instead of physical deletion.

#### `get_links`

Returns relationships involving a record.

The operation should expose:

- outgoing links declared by the record
- incoming links or backlinks derived from other records

Each relationship should identify:

- source record
- target record
- relationship kind, when present

Backlinks are derived data and do not need to be written into Markdown records.

### Optional Convenience Tools

The following operations may be added if they materially simplify agent usage, but they are not required for the first implementation.

#### `add_source`

Adds a dated source entry to an existing record without requiring the caller to replace the entire record.

#### `add_link`

Adds a relationship from one record to another.

#### `remove_link`

Removes an existing relationship.

#### `set_state`

Changes the lifecycle state of a record.

These are convenience operations over `update_record` and should not introduce different persistence semantics.

### Search Behavior

Search is intended primarily for RAG and agent context discovery.

The search implementation may use embeddings and other indexes, but the MCP contract should not expose the underlying embedding model or vector representation as part of normal operation.

Agents search for records, not vectors.

A search result should favor useful record-level context over arbitrary text fragments. If indexing operates on chunks internally, every result must retain the identity of the canonical record from which the chunk originated.

Metadata such as `kind`, `state`, and `scope` should be available as optional filters.

For example, an agent may conceptually request:

- active constraints related to database access
- decisions affecting checkout
- facts related to a particular component
- proposals related to an existing decision

The exact ranking behavior may evolve independently of the MCP interface.

### Relationships

Relationships are defined through record `links`.

The MCP server should resolve these links and make them queryable without requiring agents to manually scan the corpus.

The relationship graph is derived from canonical frontmatter.

The server may additionally provide backlinks and relationship traversal as derived functionality.

Unknown relationship kinds must be preserved and returned to callers.

### Mutation and Indexing

When a record is created, updated, or deleted, the MCP server should update or invalidate the corresponding derived data.

The implementation may perform this immediately or lazily, provided callers do not receive silently stale results once synchronization is complete.

For the initial local implementation, rebuilding or refreshing indexes after mutations is acceptable.

The MCP contract should not depend on how indexing is performed.

### Filesystem Safety

All record mutations must remain within the configured storage location.

Record identifiers must not allow path traversal outside that location.

The server should reject identifiers that resolve outside the configured record root.

The MCP server should avoid modifying files outside the record store.

### Source Control

The MCP server operates on files in the working tree.

It does not own source-control operations.

Creating or updating a record changes the corresponding Markdown file. Git or another source-control system is responsible for:

- branches
- commits
- authorship
- review
- merge
- rollback
- history

Agents using the MCP server may operate inside broader workflows that perform source-control operations, but those operations are outside the responsibility of this component.

### Concurrency

The initial implementation may assume a local working copy with relatively low write concurrency.

The server should avoid corrupting records when concurrent operations occur, but distributed locking or multi-user transactional semantics are not required for the first version.

If Geist later uses a shared remote record store, stronger concurrency semantics may be introduced without changing the basic MCP record model.

### Configuration

The MCP server should support a configurable record root.

The default is:

```text
docs/
```

The server should resolve all record operations relative to this root.

Other runtime configuration, such as embedding models, database paths, or indexing settings, belongs to the implementation and should not become part of the record format.

### Design Principle

The MCP server exposes records, not Geist internals.

Agents should reason in terms of:

- records
- content
- metadata
- relationships
- search
- lifecycle

They should not need to understand:

- SQLite schemas
- embedding vectors
- chunk indexes
- ANN implementations
- cache formats
- filesystem traversal
- parser internals

This keeps the MCP contract stable while allowing the underlying RAG and storage implementation to evolve independently.