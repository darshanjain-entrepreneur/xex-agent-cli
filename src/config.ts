import { promises as fs } from "node:fs";

export interface AgentConfig {
  cwd?: string; model?: string; provider?: string; baseUrl?: string;
  approval?: "prompt" | "safe" | "session" | "trusted";
  maxIterations?: number; timeoutMs?: number; retries?: number; maxOutput?: number;
  historyFile?: string; auditFile?: string; allowedRoots?: string[];
  explain?: boolean; timeline?: boolean; replayExport?: string; taskUndo?: boolean; privacy?: "strict" | "warn";
}
const providers = new Set(["openrouter", "openai", "anthropic", "gemini", "google", "compatible", "local"]);
function positive(name: string, value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`config.${name} must be a positive number`);
  return value;
}
export function validateConfig(value: unknown): AgentConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Config must be a JSON object.");
  const c = value as Record<string, unknown>;
  const allowed = new Set(["cwd", "model", "provider", "baseUrl", "approval", "maxIterations", "timeoutMs", "retries", "maxOutput", "historyFile", "auditFile", "allowedRoots", "explain", "timeline", "replayExport", "taskUndo", "privacy"]);
  for (const key of Object.keys(c)) if (!allowed.has(key)) throw new Error(`config.${key} is not supported.`);
  if (c.provider !== undefined && (typeof c.provider !== "string" || !providers.has(c.provider.toLowerCase()))) throw new Error("config.provider is unsupported.");
  if (c.approval !== undefined && !["prompt", "safe", "session", "trusted"].includes(String(c.approval))) throw new Error("config.approval is invalid.");
  for (const key of ["cwd", "model", "baseUrl", "historyFile", "auditFile"]) if (c[key] !== undefined && typeof c[key] !== "string") throw new Error(`config.${key} must be a string`);
  for (const key of ["maxIterations", "timeoutMs", "retries", "maxOutput"]) positive(key, c[key]);
  if (c.allowedRoots !== undefined && (!Array.isArray(c.allowedRoots) || c.allowedRoots.some(v => typeof v !== "string"))) throw new Error("config.allowedRoots must be an array of strings");
  for (const key of ["explain", "timeline", "taskUndo"]) if (c[key] !== undefined && typeof c[key] !== "boolean") throw new Error(`config.${key} must be a boolean`);
  if (c.replayExport !== undefined && typeof c.replayExport !== "string") throw new Error("config.replayExport must be a string");
  if (c.privacy !== undefined && c.privacy !== "strict" && c.privacy !== "warn") throw new Error("config.privacy must be strict or warn");
  return c as AgentConfig;
}
export async function readConfig(file: string): Promise<AgentConfig> {
  try { return validateConfig(JSON.parse(await fs.readFile(file, "utf8")) as unknown); }
  catch (error) { throw new Error(`Invalid config '${file}': ${error instanceof Error ? error.message : String(error)}`); }
}
