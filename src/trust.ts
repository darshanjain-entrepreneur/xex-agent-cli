import { promises as fs } from "node:fs";
import path from "node:path";

export type PrivacyMode = "strict" | "warn";
export type TimelineKind = "provider_request" | "tool_call" | "tool_result" | "approval" | "privacy" | "undo";
export interface TimelineEntry { time: string; kind: TimelineKind; action: string; status: "safe" | "approved" | "blocked" | "reversed" | "completed"; details?: Record<string, unknown>; }

const secretPatterns: Array<[string, RegExp]> = [
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ["openai-key", /\bsk-[A-Za-z0-9_-]{16,}\b/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ["aws-key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi],
  ["password", /((?:password|passwd|secret|token|api[_-]?key)\s*["']?\s*[=:]\s*)(["']?)[^\s"',;}]+/gi]
];

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const [, pattern] of secretPatterns) result = result.replace(pattern, (match, prefix = "") => prefix ? `${prefix}[REDACTED]` : "[REDACTED]");
    return result;
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => {
      const sensitive = /^(?:password|passwd|secret|token|api[_-]?key|authorization)$/i.test(k);
      return [k, sensitive ? "[REDACTED]" : redactSecrets(v)];
    }));
  }
  return value;
}
export function findSecrets(value: unknown): string[] {
  const text = JSON.stringify(value);
  const found: string[] = [];
  for (const [name, pattern] of secretPatterns) { pattern.lastIndex = 0; if (pattern.test(text)) found.push(name); }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.some(key => /^(?:password|passwd|secret|token|api[_-]?key|authorization)$/i.test(key))) found.push("sensitive-field");
  }
  return [...new Set(found)];
}

export class TrustTimeline {
  readonly entries: TimelineEntry[] = [];
  constructor(private readonly onEntry?: (entry: TimelineEntry) => void) {}
  add(kind: TimelineKind, action: string, status: TimelineEntry["status"], details?: Record<string, unknown>): void {
    const entry: TimelineEntry = { time: new Date().toISOString(), kind, action, status, ...(details ? { details: redactSecrets(details) as Record<string, unknown> } : {}) };
    this.entries.push(entry); this.onEntry?.(entry);
  }
  summary(): { safe: number; approved: number; blocked: number; reversed: number } {
    return { safe: this.entries.filter(e => e.status === "safe").length, approved: this.entries.filter(e => e.status === "approved").length, blocked: this.entries.filter(e => e.status === "blocked").length, reversed: this.entries.filter(e => e.status === "reversed").length };
  }
  async export(file: string, extra: Record<string, unknown> = {}): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), timeline: this.entries.map(e => redactSecrets(e)), summary: this.summary(), ...redactSecrets(extra) as Record<string, unknown> }, null, 2), { encoding: "utf8", mode: 0o600 });
  }
}
