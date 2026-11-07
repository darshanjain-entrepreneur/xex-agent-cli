import { promises as fs } from "node:fs";
import path from "node:path";
import type { Message } from "./types.js";

function validMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>;
  return ["system", "user", "assistant", "tool"].includes(String(m.role))
    && (typeof m.content === "string" || m.content === null);
}

export class ConversationHistory {
  constructor(private readonly file: string) {}
  async load(): Promise<Message[]> {
    try {
      const value: unknown = JSON.parse(await fs.readFile(this.file, "utf8"));
      if (!Array.isArray(value) || value.some(message => !validMessage(message))) return [];
      return value;
    } catch { return []; }
  }
  async save(messages: Message[]): Promise<void> {
    if (!Array.isArray(messages) || messages.some(message => !validMessage(message))) throw new Error("History contains an invalid message.");
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(messages, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, this.file);
  }
  async search(query: string): Promise<Message[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return (await this.load()).filter(message => (message.content ?? "").toLowerCase().includes(needle));
  }

}

/** Search JSON conversation files below a user-selected directory. */
export async function searchHistory(directory: string, query: string, limit = 100): Promise<Array<{ file: string; messages: Message[] }>> {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const root = path.resolve(directory);
    const files: string[] = [];
    async function walk(current: string): Promise<void> {
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && entry.name.endsWith(".json") && files.length < limit) files.push(full);
      }
    }
    try { await walk(root); } catch { return []; }
    const results: Array<{ file: string; messages: Message[] }> = [];
    for (const file of files) {
      const messages = await new ConversationHistory(file).load();
      if (messages.some(message => (message.content ?? "").toLowerCase().includes(needle))) results.push({ file, messages });
    }
  return results;
}
