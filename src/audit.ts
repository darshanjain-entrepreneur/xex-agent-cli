import { promises as fs } from "node:fs";
import path from "node:path";
export interface AuditEntry { time: string; action: string; path?: string; source?: string; destination?: string; details?: Record<string, unknown>; }
export class AuditLog {
  constructor(private readonly file: string) {}
  async record(entry: AuditEntry): Promise<void> { await fs.mkdir(path.dirname(this.file), { recursive: true }); await fs.appendFile(this.file, `${JSON.stringify(entry)}\n`, "utf8"); }
  async read(): Promise<AuditEntry[]> { try { return (await fs.readFile(this.file, "utf8")).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as AuditEntry); } catch { return []; } }
}
type Snapshot = { target: string; previous?: Buffer; existed: boolean };
export class UndoManager {
  private readonly snapshots = new Map<string, Snapshot>();
  async snapshot(file: string): Promise<void> { try { this.snapshots.set(file, { target: file, previous: await fs.readFile(file), existed: true }); } catch { this.snapshots.set(file, { target: file, existed: false }); } }
  async undo(file: string): Promise<void> { const item = this.snapshots.get(file); if (!item) throw new Error("No undo snapshot exists."); if (item.existed) await fs.writeFile(file, item.previous!); else await fs.rm(file, { force: true, recursive: true }); this.snapshots.delete(file); }
  async snapshotPair(source: string, destination: string): Promise<void> { await this.snapshot(source); await this.snapshot(destination); }
  async transaction(files: string[], operation: () => Promise<void>): Promise<void> {
    for (const file of files) await this.snapshot(file);
    try { await operation(); } catch (error) {
      for (const file of [...files].reverse()) { try { await this.undo(file); } catch { /* best effort rollback */ } }
      throw error;
    }
  }
  async undoAll(): Promise<void> {
      for (const file of [...this.snapshots.keys()].reverse()) {
        try { await this.undo(file); } catch { /* best effort rollback */ }
      }
  }
}
