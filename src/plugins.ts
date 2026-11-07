import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import type { AgentTool } from "./tools.js";
export interface PluginInfo { file: string; valid: boolean; tools: string[]; error?: string; }
function validate(value: unknown, file: string): AgentTool[] { if (!Array.isArray(value)) throw new Error(`Plugin ${file} must export default AgentTool[]`); for (const tool of value) { const candidate = tool as { definition?: { function?: { name?: unknown; description?: unknown; parameters?: unknown } }; execute?: unknown }; if (!tool || typeof tool !== "object" || typeof candidate.execute !== "function" || typeof candidate.definition?.function?.name !== "string" || !candidate.definition.function.name || typeof candidate.definition.function.description !== "string" || !candidate.definition.function.parameters || typeof candidate.definition.function.parameters !== "object") throw new Error(`Plugin ${file} contains an invalid tool`); } return value as AgentTool[]; }
async function loadPlugin(filePath: string): Promise<AgentTool[]> {
  const { pathToFileURL } = await import("node:url");
  const file = path.basename(filePath);
  const mod: unknown = await import(pathToFileURL(filePath).href);
  return validate((mod as { default?: unknown }).default, file);
}
export async function inspectPlugins(directory = path.resolve(".computer-agent", "plugins")): Promise<PluginInfo[]> {
  try {
    const files = (await fs.readdir(directory)).filter(file => /\.(js|mjs)$/i.test(file));
    return files.map(file => ({ file, valid: false, tools: [], error: "Not loaded; enable this plugin explicitly with --enable-plugin." }));
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export async function loadPlugins(directory = path.resolve(".computer-agent", "plugins"), enabledFiles: string[] = []): Promise<AgentTool[]> {
  const root = path.resolve(directory);
  const loaded: AgentTool[] = [];
  for (const file of enabledFiles) {
    const resolved = path.resolve(root, file);
    if (path.dirname(resolved) !== root || !/\.(js|mjs)$/i.test(resolved)) throw new Error(`Plugin must be a .js or .mjs file inside ${root}.`);
    try { loaded.push(...await loadPlugin(resolved)); } catch (error) { throw new Error(`Plugin ${file} failed validation: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return loaded;
}

/** Copy a plugin from a local file only; URLs and paths outside the source are rejected. */
export async function installPlugin(source: string, directory = path.resolve(".computer-agent", "plugins")): Promise<string> {
  if (/^[a-z]+:\/\//i.test(source)) throw new Error("Plugins may only be installed from a local file.");
  const resolved = path.resolve(source);
  if (!/\.(js|mjs)$/i.test(resolved)) throw new Error("Plugins must be JavaScript .js or .mjs files.");
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error("Plugin source is not a file.");
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(path.resolve(directory), path.basename(resolved));
  await fs.copyFile(resolved, destination, fsConstants.COPYFILE_EXCL).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Plugin already exists: ${path.basename(resolved)}`);
    throw error;
  });
  try { await loadPlugin(path.resolve(destination)); } catch (error) { await fs.rm(destination, { force: true }); throw new Error(error instanceof Error ? error.message : String(error)); }
  return destination;
}
