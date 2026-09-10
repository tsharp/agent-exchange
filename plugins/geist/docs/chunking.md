# Markdown chunking contract

Status: implemented v1, 2026-09-10. The TypeScript API is `chunkMarkdown(markdown, title?)` in `src/rag/chunking.ts`. It has no parser or model dependency. See [source research](chunking-research.md) for the original StructuredMarkdown specification and historical KuiperDB implementation.

## Input and structure

Accept any Markdown string. Recognize initial YAML frontmatter as document metadata and exclude it from embedding content; RAG validates and filters frontmatter through its record parser. An empty body produces no chunks. Offsets are zero-based, end-exclusive UTF-16 positions in the supplied string; RAG supplies the parsed record body. Returned text is an exact source slice, preserving newlines and Markdown.

Split at ATX and setext headings, explicit structured sections, and thematic separators. Retain the heading ancestry for each chunk. Pack adjacent blank-separated blocks within the same scope up to 800 characters. Keep fenced code, paragraphs, lists, and tables together when they fit. Fence contents do not create headings or annotations. This is a retrieval parser, not a complete CommonMark renderer: nested container headings and arbitrary HTML semantics are not interpreted.

Oversized blocks split at a line/space boundary in the latter half of an 800-character window, with a hard Unicode-safe fallback. Every nonblank content fragment is retained; no overlap is added. Split code/table fragments can be incomplete Markdown constructs. Content boundaries take priority over rendering. Whitespace-only fragments, frontmatter, standalone annotations, and thematic separators are not embedded.

## Structured Markdown profile

Support nested standalone `<!-- section: key=value; other=value -->` and `<!-- /section -->` comments. Also accept the historical comma/colon attribute dialect, including `<!-- section: name, tags: ['one', 'two'] -->`. Field separators inside quoted strings, arrays, and objects remain part of the value. Preserve unknown attributes as strings; this profile does not coerce YAML types.

Heading suffix annotations such as `## Storage <!-- topic: database -->` apply until the next heading at the same or higher level. Standalone prefix annotations such as `<!-- tag: example; owner=team -->` apply to the following block. Nested sections inherit parent metadata and override duplicate keys; section attributes take precedence over heading and block annotations. Closing a section restores its previous heading scope. An unclosed section extends to EOF; an unmatched closing marker is a boundary. Unrecognized comments remain source content.

This is a documented Geist subset of StructuredMarkdown v0.1, not a claim of complete conformance. Visibility/access metadata is retained as reference data; Geist does not enforce its restrictive-set semantics or implement authorization from these annotations.

## Output, embeddings, and identity

Each chunk returns `id`, `version`, `text`, `embeddingText`, `headings`, `metadata`, `start`, and `end`. Embedding input prefixes the source text with up to 200 characters of title and heading ancestry. Maximum embedding input is 1001 UTF-16 characters including the joining newline. This character budget is not a tokenizer guarantee; the current embedder retains its 512-token input limit.

Identity/version is SHA-256 of the chunker signature, complete title, heading ancestry, sorted effective metadata, and exact text. Offsets and document version are excluded. Inserting or editing an unrelated section therefore preserves other chunk identities. Changes within a packed block can change its neighboring chunk boundaries. Identical chunks within one document coalesce during ranking; different documents remain distinct provenance sources.

Indexing hashes source documents, regenerates chunks after changes, and reuses vectors for unchanged chunk versions in the same document. Model or chunker/schema changes and explicit rebuild invalidate embeddings. Empty documents remain manageable records but contribute no search matches.

## Retrieval and delivery

Rank individual chunks by cosine similarity, descending score then record ID and source offset. `top_k` and explicit search limits count chunks, so multiple results may reference one record. Record filters apply to all its chunks. Search returns document ID/version/path, chunk ID/version, headings, metadata, body offsets, complete chunk content, and a short preview excerpt.

Automatic context includes complete chunks that fit the total character budget, explicitly wrapped as untrusted references. A chunk that does not fit is skipped and is not marked delivered. Session deduplication keys on source record and chunk identity/version; reading or delivering one chunk never suppresses the entire document. Select the normal top results before suppression and do not backfill lower-ranked chunks. Session lifecycle reset behavior is unchanged; old document-level delivery snapshots are incompatible and start fresh.
