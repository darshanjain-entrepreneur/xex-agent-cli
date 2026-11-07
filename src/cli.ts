#!/usr/bin/env node
import * as readline from "node:readline/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import "dotenv/config";
import { OpenRouterProvider, providerFromConfig } from "./provider.js";
import { Agent } from "./agent.js";
import { approvalHandler } from "./permissions.js";
import { createTools } from "./tools.js";
import { loadPlugins, inspectPlugins } from "./plugins.js";
import { readConfig } from "./config.js";
import { detectSandboxCapabilities, safeDenylist } from "./sandbox.js";
import { browserAvailable } from "./browser.js";
import { searchHistory } from "./history.js";
import { TrustTimeline, type PrivacyMode } from "./trust.js";

const VERSION = "0.1.0";
function help(): void {
  console.log(`xex ${VERSION}
Usage: xex [options] [prompt]
  --help              Show help
  --version           Show version
  --cwd <dir>         Working directory (default: current directory)
  --model <model>     OpenRouter model
  --provider <name>    provider override (default: COMPUTER_AGENT_PROVIDER or openrouter)
  --base-url <url>     OpenAI-compatible endpoint
  --approval <mode>    prompt, safe, session, or trusted
  --history <file>     Resume conversation from JSON
  --audit <file>       Append audit records
  --stream             Print streamed response deltas
  --config <file>     JSON config file
  --max-iterations N  Maximum agent iterations
  --timeout MS        Tool timeout
  --retries N         Provider retries
  --allowed-root <dir> Allow filesystem root (repeatable; default: cwd)
  --max-output N      Maximum bytes returned by tools
  --list-plugins      List plugins without executing them
  --validate-plugins  List plugins without executing them
  --enable-plugin F   Explicitly load a plugin from .computer-agent/plugins
  --install-plugin F  Install a local .js/.mjs plugin safely
  --search-history Q  Search JSON history files below cwd
  --browser-check     Check optional Playwright availability (does not download)
  --progress          Print tool activity to stderr
  --timeline          Print a redacted action timeline to stderr
  --explain           Show and confirm a plan before every model tool action
  --replay-export F   Export a redacted, shareable task replay JSON
  --task-undo         Enable the undo_task tool for task-level rollback
  --privacy MODE      strict (block) or warn (redact) secret-like tool inputs
  --diagnostics       Show capability and policy diagnostics (no secrets)
  GUI control is disabled by default; browser tools require optional Playwright.`);
}
async function main(): Promise<void> {
  const args = process.argv.slice(2); let cwd = process.cwd(); let model: string | undefined; let providerName: string | undefined; let baseUrl: string | undefined; let approval: "prompt" | "safe" | "trusted" | "session" = "prompt"; let historyFile: string | undefined; let auditFile: string | undefined; let stream = false; let progress = false; let timelineEnabled = false; let explain = false; let replayExport: string | undefined; let taskUndo = false; let privacy: PrivacyMode = "warn"; let configPath: string | undefined; let maxIterations: number | undefined; let timeoutMs: number | undefined; let retries: number | undefined; let maxOutput: number | undefined; let listPlugins = false; let installPluginPath: string | undefined; let searchHistoryQuery: string | undefined; let browserCheck = false; let diagnostics = false; const allowedRoots: string[] = []; const enabledPlugins: string[] = []; const promptParts: string[] = [];
  for (let n = 0; n < args.length; n++) { const a = args[n]; if (!a) continue; if (a === "--help" || a === "-h") { help(); return; } if (a === "--version" || a === "-v") { console.log(VERSION); return; } const next = args[n + 1]; if (a === "--stream") stream = true; else if (a === "--progress") progress = true; else if (a === "--timeline") timelineEnabled = true; else if (a === "--explain") explain = true; else if (a === "--task-undo") taskUndo = true; else if (a === "--privacy" && next) { privacy = next as PrivacyMode; n++; } else if (a === "--replay-export" && next) { replayExport = next; n++; } else if (a === "--browser-check") browserCheck = true; else if (a === "--diagnostics") diagnostics = true; else if (a === "--list-plugins" || a === "--validate-plugins") listPlugins = true; else if (a === "--enable-plugin" && next) { enabledPlugins.push(next); n++; } else if (a === "--install-plugin" && next) { installPluginPath = next; n++; } else if (a === "--search-history" && next) { searchHistoryQuery = next; n++; } else if (a === "--allowed-root" && next) { allowedRoots.push(next); n++; } else if (a === "--max-output" && next) { maxOutput = Number(next); n++; } else if (a === "--approval" && next) { approval = next as typeof approval; n++; } else if (a === "--history" && next) { historyFile = next; n++; } else if (a === "--audit" && next) { auditFile = next; n++; } else if (a === "--provider" && next) { providerName = next; n++; } else if (a === "--base-url" && next) { baseUrl = next; n++; } else if (a === "--cwd" && next) { cwd = next; n++; } else if (a === "--model" && next) { model = next; n++; } else if (a === "--config" && next) { configPath = next; n++; } else if (a === "--max-iterations" && next) { maxIterations = Number(next); n++; } else if (a === "--timeout" && next) { timeoutMs = Number(next); n++; } else if (a === "--retries" && next) { retries = Number(next); n++; } else promptParts.push(a); }
  if (configPath) { const config = await readConfig(configPath); cwd = config.cwd ?? cwd; model = model ?? config.model; providerName = providerName ?? config.provider; baseUrl = baseUrl ?? config.baseUrl; approval = approval === "prompt" ? (config.approval ?? approval) : approval; maxIterations = maxIterations ?? config.maxIterations; timeoutMs = timeoutMs ?? config.timeoutMs; retries = retries ?? config.retries; maxOutput = maxOutput ?? config.maxOutput; historyFile = historyFile ?? config.historyFile; auditFile = auditFile ?? config.auditFile; explain = explain || config.explain === true; timelineEnabled = timelineEnabled || config.timeline === true; replayExport = replayExport ?? config.replayExport; taskUndo = taskUndo || config.taskUndo === true; privacy = config.privacy ?? privacy; if (!allowedRoots.length && config.allowedRoots) allowedRoots.push(...config.allowedRoots); }
  if (diagnostics) { const capabilities = await detectSandboxCapabilities(); console.log(JSON.stringify({ capabilities, gui: { enabled: false }, browser: "optional", denylist: safeDenylist() }, null, 2)); return; }
  if (browserCheck) { console.log(JSON.stringify({ available: await browserAvailable(), install: "npm install playwright (browser downloads are separate and optional)" })); return; }
  if (searchHistoryQuery) { console.log(JSON.stringify(await searchHistory(cwd, searchHistoryQuery), null, 2)); return; }
  const pluginDir = path.join(cwd, ".computer-agent", "plugins"); if (installPluginPath) { const { installPlugin } = await import("./plugins.js"); console.log(await installPlugin(installPluginPath, pluginDir)); return; } if (listPlugins) { console.table(await inspectPlugins(pluginDir)); return; }
  const selectedProvider = providerName ?? process.env.COMPUTER_AGENT_PROVIDER ?? "openrouter";
  const provider = selectedProvider === "openrouter"
    ? new OpenRouterProvider({ ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) })
    : providerFromConfig({ provider: selectedProvider, ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) });
  const trustTimeline = new TrustTimeline(timelineEnabled ? (entry) => process.stderr.write(`[timeline] ${JSON.stringify(entry)}\n`) : undefined);
  const agent = new Agent(provider, approvalHandler(approval), cwd, [...createTools(), ...await loadPlugins(pluginDir, enabledPlugins)], { maxIterations, timeoutMs, retries, historyFile, auditFile, maxOutput, explain, privacy, replayExport, taskUndo, timeline: trustTimeline, allowedCwdRoots: allowedRoots.length ? allowedRoots : [cwd], onDelta: stream ? (delta) => { process.stdout.write(delta); } : undefined, onActivity: progress ? (message) => { process.stderr.write(`[activity] ${message}\n`); } : undefined });
  const prompt = promptParts.join(" ").trim();
  if (prompt) { const result = await agent.run(prompt); if (!stream) console.log(result); else process.stdout.write("\n"); if (timelineEnabled) process.stderr.write(`[trust-summary] ${JSON.stringify(trustTimeline.summary())}\n`); return; }
  const rl = readline.createInterface({ input, output, prompt: "agent> " });
  console.log("xex agent. Type /exit to quit.");
  try { for await (const line of rl) { if (line.trim() === "/exit") break; if (line.trim()) try { console.log(await agent.run(line)); } catch (error) { console.error(error instanceof Error ? error.message : error); } rl.prompt(); } }
  finally { rl.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
