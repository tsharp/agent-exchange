import { createHash } from "node:crypto";

export const CHUNKER_SIGNATURE = "geist-markdown-v1:body800:context200";
export type MarkdownChunk = {
  id: string; version: string; text: string; embeddingText: string;
  headings: string[]; metadata: Record<string, string>; start: number; end: number;
};
type Line = { text: string; start: number; end: number };
const digest = (text: string) => createHash("sha256").update(text).digest("hex");

// Split annotation fields outside quoted strings and array/object values.
function attributes(value: string): Record<string, string> {
  const fields: string[] = [];
  let start = 0, depth = 0, quote = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) { if (c === quote && value[i - 1] !== "\\") quote = ""; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
    else if (!depth && (c === ";" || c === ",")) { fields.push(value.slice(start, i)); start = i + 1; }
  }
  fields.push(value.slice(start));
  const result: Record<string, string> = Object.create(null);
  for (const field of fields) {
    const pair = /^\s*([\w.-]+)\s*[:=]\s*([\s\S]*?)\s*$/.exec(field);
    if (pair) result[pair[1]] = pair[2];
    else if (field.trim()) result.name = field.trim();
  }
  return result;
}

/** Chunk ordinary or structured Markdown. Offsets address the original UTF-16 input. */
export function chunkMarkdown(markdown: string, title = ""): MarkdownChunk[] {
  const lines: Line[] = [...markdown.matchAll(/[^\n]*\n|[^\n]+$/g)].map((m) => ({
    text: m[0].replace(/\r?\n$/, ""), start: m.index!, end: m.index! + m[0].length,
  }));
  let first = 0;
  if (lines[0]?.text.replace(/^\uFEFF/, "") === "---") {
    const closing = lines.findIndex((line, i) => i > 0 && line.text === "---");
    if (closing >= 0) first = closing + 1;
  }
  const chunks: MarkdownChunk[] = [];
  const headings: { level: number; text: string; metadata: Record<string, string> }[] = [];
  const sections: { metadata: Record<string, string>; headings: typeof headings }[] = [];
  let blockMetadata: Record<string, string> = {};
  let pendingStart = -1, pendingEnd = -1;
  function emit(start: number, end: number) {
    const text = markdown.slice(start, end);
    if (!text.trim()) return;
    const path = headings.map((h) => h.text);
    const metadata = Object.assign({}, ...headings.map((h) => h.metadata), blockMetadata, ...sections.map((s) => s.metadata));
    const context = [title, ...path.filter((h) => h !== title)].filter(Boolean).join(" > ").slice(0, 200);
    const embeddingText = context ? `${context}\n${text}` : text;
    const version = digest(JSON.stringify([CHUNKER_SIGNATURE, title, path, Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b)), text]));
    chunks.push({ id: version, version, text, embeddingText, headings: path, metadata, start, end });
  }
  function flush() {
    if (pendingStart >= 0) emit(pendingStart, pendingEnd);
    pendingStart = pendingEnd = -1;
  }
  function block(start: number, end: number) {
    if (pendingStart >= 0 && end - pendingStart > 800) flush();
    if (end - start <= 800) {
      if (pendingStart < 0) pendingStart = start;
      pendingEnd = end;
      return;
    }
    flush();
    // Oversized blocks split at a nearby line/word boundary, with a hard fallback.
    while (end - start > 800) {
      let stop = start + 800;
      const window = markdown.slice(start, stop);
      const boundary = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
      if (boundary >= 400) stop = start + boundary + 1;
      if (/[\uD800-\uDBFF]/.test(markdown[stop - 1])) stop--;
      emit(start, stop);
      start = stop;
    }
    if (start < end) { pendingStart = start; pendingEnd = end; }
  }
  for (let i = first; i < lines.length;) {
    const line = lines[i];
    const section = /^\s*<!--\s*section:\s*(.*?)\s*-->\s*$/.exec(line.text);
    if (section) {
      flush(); blockMetadata = {};
      sections.push({ metadata: attributes(section[1]), headings: [...headings] });
      i++; continue;
    }
    if (/^\s*<!--\s*\/section\s*-->\s*$/.test(line.text)) {
      flush(); blockMetadata = {};
      const closed = sections.pop();
      if (closed) headings.splice(0, headings.length, ...closed.headings);
      i++; continue;
    }
    const annotation = /^\s*<!--\s*([\w.-]+\s*[:=][\s\S]*?)\s*-->\s*$/.exec(line.text);
    if (annotation) { flush(); blockMetadata = attributes(annotation[1]); i++; continue; }
    const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/.exec(line.text);
    const setext = i + 1 < lines.length && line.text.trim() && !/^\s*(?:[-*+]\s|>|`|~|<)/.test(line.text)
      ? /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[i + 1].text) : null;
    if (atx || setext) {
      flush();
      const level = atx ? atx[1].length : setext![1][0] === "=" ? 1 : 2;
      let text = atx ? (atx[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "") : line.text.trim();
      const inline = /\s*<!--\s*(.*?)\s*-->\s*$/.exec(text);
      const metadata = inline ? attributes(inline[1]) : {};
      if (inline) text = text.slice(0, inline.index).trim();
      while (headings.length && headings.at(-1)!.level >= level) headings.pop();
      headings.push({ level, text, metadata });
      block(line.start, lines[i + (setext ? 1 : 0)].end);
      i += setext ? 2 : 1;
      continue;
    }
    if (/^ {0,3}(?:(?:\*\s*){3,}|(?:_\s*){3,}|(?:-\s*){3,})$/.test(line.text)) {
      flush(); blockMetadata = {}; i++; continue;
    }
    if (!line.text.trim()) { if (pendingStart >= 0) pendingEnd = line.end - pendingStart <= 800 ? line.end : pendingEnd; i++; continue; }
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.text);
    let j = i + 1;
    if (fence && !(fence[1][0] === "`" && fence[2].includes("`"))) {
      const close = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`);
      while (j < lines.length && !close.test(lines[j].text)) j++;
      if (j < lines.length) j++;
    } else if (/^\s*<!--/.test(line.text) && !line.text.includes("-->")) {
      while (j < lines.length && !lines[j].text.includes("-->")) j++;
      if (j < lines.length) j++;
    } else {
      while (j < lines.length && lines[j].text.trim() &&
        !/^ {0,3}(?:#{1,6}(?:\s|$)|`{3,}|~{3,}|<!--|(?:(?:\*\s*){3,}|(?:_\s*){3,}|(?:-\s*){3,})$)/.test(lines[j].text) &&
        !(j + 1 < lines.length && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[j + 1].text))) j++;
    }
    block(line.start, lines[j - 1].end);
    if (Object.keys(blockMetadata).length) { flush(); blockMetadata = {}; }
    i = j;
  }
  flush();
  return chunks;
}
