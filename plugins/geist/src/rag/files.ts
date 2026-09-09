import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { RagError, safePath, type RagConfig } from "./config.ts";

export function atomicWrite(path: string, content: string | Uint8Array): void {
  const temp = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, content, { flag: "wx" });
    renameSync(temp, path);
  } finally {
    try { unlinkSync(temp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

export async function withLock<T>(config: RagConfig, name: string, action: () => T | Promise<T>): Promise<T> {
  safePath(config.workspace, config.cacheDirectory);
  mkdirSync(config.cacheDirectory, { recursive: true });
  const path = safePath(config.workspace, join(config.cacheDirectory, `${name}.lock`));
  let descriptor: number;
  try { descriptor = openSync(path, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let abandoned = false;
    try {
      const { pid } = JSON.parse(readFileSync(path, "utf8"));
      if (Number.isInteger(pid) && pid > 0) {
        try { process.kill(pid, 0); }
        catch (probe) { abandoned = (probe as NodeJS.ErrnoException).code === "ESRCH"; }
      }
    } catch { /* An incomplete lock can belong to a writer that is starting. */ }
    if (!abandoned) throw new RagError("busy", `Geist ${name} is locked; retry or inspect the lock's PID`);
    try { unlinkSync(path); descriptor = openSync(path, "wx"); }
    catch { throw new RagError("busy", `Geist ${name} lock changed; retry`); }
  }
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid }));
    return await action();
  } finally { closeSync(descriptor); unlinkSync(path); }
}
