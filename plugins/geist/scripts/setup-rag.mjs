import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const plugin = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(plugin, "package.json"), "utf8"));
const dependencies = Object.entries(manifest.dependencies).map(([name, version]) => `${name}@${version}`);
// Install only the pinned runtime packages; source compilation is not part of setup.
const args = ["install", "--omit=dev", "--no-save", "--package-lock=false", "--workspaces=false", "--prefix", plugin, ...dependencies];
let command = "npm";
if (process.platform === "win32") {
  const found = spawnSync("where.exe", ["npm.cmd"], { encoding: "utf8", windowsHide: true });
  const shim = found.stdout?.trim().split(/\r?\n/)[0];
  const cli = shim && join(dirname(shim), "node_modules", "npm", "bin", "npm-cli.js");
  if (!cli || !existsSync(cli)) throw new Error("Cannot locate npm-cli.js. Install Node.js with npm and retry.");
  command = process.execPath;
  args.unshift(cli);
}
const installed = spawnSync(command, args, { stdio: "inherit", windowsHide: true });
if (installed.status !== 0) process.exit(installed.status || 1);
const prepared = spawnSync(process.execPath, [join(plugin, "runtime", "rag", "run.mjs"), "prepare", process.cwd()],
  { stdio: "inherit", windowsHide: true });
process.exitCode = prepared.status ?? 1;
