import type { Message, PermissionHandler, Provider } from "./types.js";
import { createTools, type AgentTool } from "./tools.js";
import { ConversationHistory } from "./history.js";
import { AuditLog, UndoManager } from "./audit.js";
import { findSecrets, redactSecrets, TrustTimeline, type PrivacyMode } from "./trust.js";

const SYSTEM = "You are a careful coding assistant. Use tools to inspect and modify files when useful. Explain actions concisely. Never claim an action succeeded unless a tool confirms it.";

export class Agent {
  private readonly tools: AgentTool[];
  constructor(private readonly provider: Provider, private readonly permissions: PermissionHandler, private readonly cwd = process.cwd(), tools = createTools(), private readonly options: { maxIterations?: number | undefined; retries?: number | undefined; timeoutMs?: number | undefined; historyFile?: string | undefined; auditFile?: string | undefined; onDelta?: ((delta: string) => void) | undefined; onActivity?: ((message: string) => void) | undefined; allowedCwdRoots?: string[] | undefined; commandDenylist?: string[] | undefined; maxOutput?: number | undefined; explain?: boolean | undefined; privacy?: PrivacyMode | undefined; timeline?: TrustTimeline | undefined; replayExport?: string | undefined; taskUndo?: boolean | undefined } = {}) {
    this.tools = options.taskUndo === true ? tools : tools.filter(tool => tool.definition.function.name !== "undo_task");
  }

  async run(prompt: string, maxSteps = this.options.maxIterations ?? 12): Promise<string> {
    const history = this.options.historyFile ? new ConversationHistory(this.options.historyFile) : undefined;
    const audit = this.options.auditFile ? new AuditLog(this.options.auditFile) : undefined;
    const undo = new UndoManager();
    const timeline = this.options.timeline ?? new TrustTimeline((entry) => this.options.onActivity?.(`${entry.kind}: ${entry.action} (${entry.status})`));
    const saved = await history?.load() ?? [];
    const messages: Message[] = saved.length ? saved.concat({ role: "user", content: prompt }) : [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }];
    for (let step = 0; step < maxSteps; step++) {
      this.options.onActivity?.(`provider request (step ${step + 1}/${maxSteps})`);
      timeline.add("provider_request", `step ${step + 1}`, "safe");
      let response: Message | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt <= (this.options.retries ?? 2); attempt++) {
        try {
          response = this.options.onDelta && this.provider.stream
            ? await this.provider.stream(messages, this.tools.map(t => t.definition), this.options.onDelta)
            : await this.provider.complete(messages, this.tools.map(t => t.definition));
          break;
        }
        catch (error) { lastError = error; if (attempt === (this.options.retries ?? 2)) throw lastError; await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1))); }
      }
      if (!response) throw new Error("Provider returned no response.");
      messages.push(response);
      if (!response.tool_calls?.length) { await history?.save(redactSecrets(messages) as Message[]); if (this.options.replayExport) await timeline.export(this.options.replayExport, { prompt }); return response.content ?? ""; }
      const results = await Promise.all(response.tool_calls.map(async (call) => {
        this.options.onActivity?.(`tool ${call.function.name}`);
        const tool = this.tools.find(t => t.definition.function.name === call.function.name);
        let result: string;
        if (!tool) result = `Unknown tool: ${call.function.name}`;
        else {
          try {
            const parsed: unknown = JSON.parse(call.function.arguments);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Tool arguments must be a JSON object.");
            const input = parsed as Record<string, unknown>;
            const secrets = findSecrets(input);
            if (secrets.length && this.options.privacy === "strict") { timeline.add("privacy", call.function.name, "blocked", { patterns: secrets }); throw new Error("Privacy firewall blocked secret-like tool input."); }
            const safeInput = (secrets.length ? redactSecrets(input) : input) as Record<string, unknown>;
            if (secrets.length) timeline.add("privacy", call.function.name, "completed", { patterns: secrets, action: "redacted" });
            timeline.add("tool_call", call.function.name, "safe", { input: safeInput });
            const preapprovedTools = new Set<string>();
            if (this.options.explain) {
              const approved = await this.permissions({ tool: call.function.name, input: safeInput, reason: `Plan: execute ${call.function.name} with the shown arguments. Confirm before execution.`, classification: "write" });
              timeline.add("approval", call.function.name, approved ? "approved" : "blocked");
              if (!approved) throw new Error("Tool execution not confirmed.");
              preapprovedTools.add(call.function.name);
            }
            const permission = async (request: Parameters<PermissionHandler>[0]): Promise<boolean> => {
              const approved = await this.permissions(request);
              timeline.add("approval", request.tool, approved ? "approved" : "blocked");
              return approved;
            };
            result = await tool.execute(safeInput, { cwd: this.cwd, permissions: permission, commandTimeoutMs: this.options.timeoutMs ?? 30_000, audit, undo, allowedCwdRoots: this.options.allowedCwdRoots, commandDenylist: this.options.commandDenylist, maxOutput: this.options.maxOutput, preapprovedTools });
            timeline.add("tool_result", call.function.name, "safe");
          }
          catch (error) { timeline.add("tool_result", call.function.name, "blocked", { error: error instanceof Error ? error.message : String(error) }); result = `Tool error: ${error instanceof Error ? error.message : String(error)}`; }
        }
        return { role: "tool" as const, tool_call_id: call.id, name: call.function.name, content: result };
      }));
      messages.push(...results);
    }
    if (this.options.replayExport) await timeline.export(this.options.replayExport, { prompt });
    throw new Error(`Agent exceeded the ${maxSteps}-step tool limit.`);
  }
}
