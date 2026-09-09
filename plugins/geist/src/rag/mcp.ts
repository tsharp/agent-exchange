import { startServer } from "./server.ts";

try { await startServer(process.env.GEIST_WORKSPACE_DIR || process.cwd()); }
catch (error) { console.error(error instanceof Error ? error.message : "Geist MCP startup failed"); process.exitCode = 1; }
