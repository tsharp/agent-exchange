import { existsSync, readFileSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse } from "smol-toml";

export class RagError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

// Reject links at every existing component, including parents of a new file.
export function safePath(root: string, path: string): string {
  const target = resolve(path);
  if (!inside(root, target)) throw new RagError("invalid_id", "Path must stay inside its root");
  let cursor = target;
  while (inside(root, cursor)) {
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new RagError("invalid_id", "Linked paths are not records or cache directories");
      if (!inside(root, realpathSync(cursor))) throw new RagError("invalid_id", "Resolved path escapes its root");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (cursor === root) break;
    cursor = dirname(cursor);
  }
  return target;
}

export type RagConfig = {
  workspace: string; root: string; cacheDirectory: string;
  enabled: boolean; topK: number; minScore: number; maxContextChars: number; timeoutMs: number;
};

export function readRagConfig(workspace: string): RagConfig {
  workspace = realpathSync(resolve(workspace));
  const selected = process.env.GEIST_CONFIG_FILE?.trim();
  const configPath = selected || join(workspace, ".geist", "config.toml");
  let raw: Record<string, unknown> = {};
  try {
    if (selected || existsSync(configPath)) raw = parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  } catch { throw new RagError("invalid_config", "Cannot read Geist TOML configuration"); }
  const value = raw.rag ?? {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RagError("invalid_config", "rag must be a TOML table");
  const rag = value as Record<string, unknown>;
  for (const key of Object.keys(rag)) {
    if (!["enabled", "root", "top_k", "min_score", "max_context_chars", "timeout_ms"].includes(key)) {
      throw new RagError("invalid_config", `Unknown rag option: ${key}`);
    }
  }
  if (rag.enabled !== undefined && typeof rag.enabled !== "boolean") throw new RagError("invalid_config", "rag.enabled must be boolean");
  function number(key: string, fallback: number, min: number, max: number, integer = true): number {
    const value = rag[key] ?? fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      throw new RagError("invalid_config", `rag.${key} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}`);
    }
    return value;
  }
  const recordRoot = rag.root ?? "docs";
  if (typeof recordRoot !== "string" || !recordRoot.trim() || isAbsolute(recordRoot)) throw new RagError("invalid_config", "rag.root must be a workspace-relative directory");
  const root = safePath(workspace, resolve(workspace, recordRoot));
  const cacheDirectory = safePath(workspace, join(workspace, ".geist", "cache", "rag"));
  if (inside(root, cacheDirectory)) throw new RagError("invalid_config", "Record root must not contain the derived cache");
  return { workspace, root, cacheDirectory, enabled: rag.enabled === true,
    topK: number("top_k", 3, 1, 20), minScore: number("min_score", 0.25, 0, 1, false),
    maxContextChars: number("max_context_chars", 1800, 256, 8000), timeoutMs: number("timeout_ms", 4000, 100, 4500) };
}
