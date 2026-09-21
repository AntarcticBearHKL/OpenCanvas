import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Vite bundles this module into vite.config.ts and rewrites import.meta.url to the config file,
// so when the module dir has no agent-instructions.md we fall back to its server/ child.
const moduleDir = dirname(fileURLToPath(import.meta.url));
const serverDir = existsSync(resolve(moduleDir, "agent-instructions.md")) ? moduleDir : resolve(moduleDir, "server");

export const INSTRUCTIONS = readFileSync(resolve(serverDir, "agent-instructions.md"), "utf8");
export const VERSION = (JSON.parse(readFileSync(resolve(serverDir, "..", "package.json"), "utf8")) as { version?: string }).version || "0.0.0";
