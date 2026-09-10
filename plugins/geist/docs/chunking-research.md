# Markdown chunking source research

Investigated on 2026-09-10. This note records the prior art behind Geist's chunking contract; implementation requirements belong in the chunking specification and public RAG plan.

## Structured Markdown

The supplied [XArch.StructuredMarkdown repository](https://github.com/tsharp/XArch.StructuredMarkdown) returned HTTP 404 through both the public website and the connected GitHub API. Its existing local checkout, `C:/workspaces/workspace_ai/XArch.StructuredMarkdown`, has that exact origin and commit `73cc4c6c259db101fc44fa731fa1bd18f4f1a640`. The following findings come from its committed files, which were read without modifying the checkout. Links identify those files at that commit, but require repository access. An untracked Rust port in the checkout was excluded from the evidence.

The original **Markdown Content Partitioning and Tagging Spec**, version 0.1 dated 2025-07-02, defines HTML comments as Markdown-compatible metadata and partition markers. Its intended applications include tagged data and chunk retrieval for RAG. [Original specification](https://github.com/tsharp/XArch.StructuredMarkdown/blob/73cc4c6c259db101fc44fa731fa1bd18f4f1a640/docs/SPEC.md)

| Construct | Original contract |
| --- | --- |
| `<!-- section: kind=notes; source=manual -->` | Opens a metadata-bearing block; `<!-- /section -->` closes the latest open block. Blocks can nest, with child metadata supplementing or overriding parent values. |
| `# Heading <!-- visible_to: [dm, author] -->` | Metadata applies until the next heading of the same or higher level. |
| `<!-- visible_to: [dm] --> Paragraph` | Prefix metadata applies to that paragraph or list. |
| `<!-- tag: interaction; npc=Keshra; session=20 -->` | Tags the following line or paragraph for queries and indexing. |

Explicit section metadata takes precedence over inline metadata. The specification calls for the most restrictive overlapping visibility rule and preserving unknown keys during editing. It does not define an application authorization model or a chunk-size algorithm. [Scope, precedence, and extensibility rules](https://github.com/tsharp/XArch.StructuredMarkdown/blob/73cc4c6c259db101fc44fa731fa1bd18f4f1a640/docs/SPEC.md)

There is a syntax mismatch between the written specification and the C# implementation: the specification uses semicolon-separated `key=value` section attributes, while the parser converts comma-separated `key: value` metadata into YAML, respecting commas inside arrays. Checked-in fixtures use `<!-- section: named-sub-section, tags: ['external-section'] -->` and paragraph-prefix `<!-- tags: ['paragraph'], content_level: hidden -->`. A compatibility profile should explicitly describe which forms it accepts. [Metadata parser](https://github.com/tsharp/XArch.StructuredMarkdown/blob/73cc4c6c259db101fc44fa731fa1bd18f4f1a640/src/XArch.StructuredMarkdown/Parsing/XmlCommentParser.cs), [fixture](https://github.com/tsharp/XArch.StructuredMarkdown/blob/73cc4c6c259db101fc44fa731fa1bd18f4f1a640/src/XArch.StructuredMarkdown.UnitTests/test-data/markdown/structured_markdown_with_frontmatter.md)

The C# document parser also accepts YAML frontmatter bounded by `---` at the beginning of a document, and models headings, explicit sections, and paragraph content separately. [Document parser](https://github.com/tsharp/XArch.StructuredMarkdown/blob/73cc4c6c259db101fc44fa731fa1bd18f4f1a640/src/XArch.StructuredMarkdown/StructuredMarkdownParser.cs)

## Historical KuiperDB implementation

The last version before removal is commit `4b1129239681398ccd6ad66d12313aea6a15e765`; commit `bb0ffe4dd2bab6244b5219eed5cee4803dd58ddf` removed chunking as part of the vector-first storage refactor. The current core explicitly puts parsing, chunking, and inference outside the database. [Removal commit](https://github.com/kuipersys/kuiperdb/commit/bb0ffe4dd2bab6244b5219eed5cee4803dd58ddf), [current architectural boundary](https://github.com/kuipersys/kuiperdb/blob/8efea12/README.md)

The old `MarkdownChunker` used this sequence:

1. Split at standalone trimmed lines containing at least three copies of `-`, `_`, or `*`, discarding those separator lines.
2. Retain each resulting section when its `cl100k_base` token count fits the limit.
3. Pack oversized sections by paragraphs separated by two newlines.
4. Split an oversized paragraph using fixed token windows with a hardcoded overlap of 50 tokens.

The Markdown strategy ignored its supplied overlap argument. It did not distinguish frontmatter, headings, code fences, metadata comments, or Setext underlines. These are findings from reading the algorithm, not claims that it implemented a full Markdown parser. [Historical chunker and tests](https://github.com/kuipersys/kuiperdb/blob/4b1129239681398ccd6ad66d12313aea6a15e765/src/kuiperdb-core/src/chunking.rs)

The fixed-token strategy used the same tokenizer and constrained overlap to at most `chunk_size - 1`. Configuration defaults were 512 tokens for the threshold and target size, with 50 tokens of overlap. [Chunker](https://github.com/kuipersys/kuiperdb/blob/4b1129239681398ccd6ad66d12313aea6a15e765/src/kuiperdb-core/src/chunking.rs), [configuration](https://github.com/kuipersys/kuiperdb/blob/4b1129239681398ccd6ad66d12313aea6a15e765/src/kuiperdb-core/src/config.rs)

The old API documentation describes preserving the full parent without embedding it, embedding child records independently, and returning matched chunks with `parent_id`, `chunk_index`, and `is_chunk`. Rechunking replaces all children with newly identified records. This supports the user's requested indexing granularity, but does not provide stable content-based chunk identity or conversation injection deduplication. [Historical chunk API](https://github.com/kuipersys/kuiperdb/blob/4b1129239681398ccd6ad66d12313aea6a15e765/src/kuiperdb-server/docs/api-chunking.md)

## Implications for Geist

The following are design recommendations inferred from the sources and the user's request:

- Prefer explicit Structured Markdown section boundaries and scoped metadata when present; fall back to headings and Markdown blocks for ordinary documents.
- Support both documented and implemented XArch attribute forms where practical, and describe the supported subset rather than claiming complete parser equivalence.
- Protect fenced and indented code from structural marker detection. Distinguish initial frontmatter and Setext headings from thematic breaks. CommonMark permits spaced thematic-break characters and gives Setext headings precedence where ambiguous; fence contents are literal. [CommonMark block syntax](https://spec.commonmark.org/0.31.2/#thematic-breaks), [fenced code](https://spec.commonmark.org/0.31.2/#fenced-code-blocks)
- Keep source document identity, source position, heading context, and inherited metadata on each chunk. Use chunk identity and revision when deduplicating injected results, so a previously retrieved section does not suppress another relevant section of the same document.
- Keep chunking outside vector storage, consistent with KuiperDB's current boundary. Version the chunking contract so derived embeddings can be invalidated when segmentation changes.
- Treat metadata as reference data. XArch visibility tags alone do not establish authorization or change Geist's distinction between trusted configured instructions and retrieved material.
