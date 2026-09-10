import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { after } from "node:test";
import assert from "node:assert/strict";

// Every test process and its children use isolated user data, never the real home.
const directory = mkdtempSync(join(tmpdir(), "geist-user-test-"));
process.env.GEIST_USER_DIR = directory;
after(() => {
  assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}geist-user-test-`));
  rmSync(directory, { recursive: true, force: true });
});
