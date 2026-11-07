import type { Message, Provider, ToolDefinition } from "./types.js";

interface ApiResponse { choices?: Array<{ message?: Message; delta?: { content?: string } }>; error?: { message?: string }; content?: Array<{ text?: string }>; candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }> } }>; }
export interface ProviderOptions { apiKey?: string | undefined; model?: string | undefined; baseUrl?: string | undefined; name?: string | undefined; fetch?: typeof fetch | undefined; }
function geminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key !== "additionalProperties") output[key] = geminiSchema(item);
  }
  return output;
}

export class OpenAICompatibleProvider implements Provider {
  constructor(public readonly options: ProviderOptions = {}) {
    if (!options.apiKey && !options.baseUrl) throw new Error(`${options.name ?? "Provider"} API key is required (or configure a local base URL).`);
  }
  async complete(messages: Message[], tools: ToolDefinition[]): Promise<Message> {
    const data = await this.request(messages, tools, false); const message = data.choices?.[0]?.message;
    if (!message) throw new Error(`${this.options.name ?? "Provider"} returned no assistant message.`); return message;
  }
  async stream(messages: Message[], tools: ToolDefinition[], onDelta: (delta: string) => void): Promise<Message> {
    if (tools.length) return this.complete(messages, tools);
    const response = await fetch(this.url(), { method: "POST", headers: this.headers(), body: JSON.stringify(this.body(messages, tools, true)) });
    if (!response.ok || !response.body) return this.complete(messages, tools);
    let content = ""; let pending = ""; const reader = response.body.getReader(); const decoder = new TextDecoder();
    for (;;) { const part = await reader.read(); pending += decoder.decode(part.value, { stream: !part.done }); const lines = pending.split(/\r?\n/); pending = lines.pop() ?? ""; for (const line of lines) { if (!line.startsWith("data: ") || line.slice(6).trim() === "[DONE]") continue; try { const delta = (JSON.parse(line.slice(6)) as ApiResponse).choices?.[0]?.delta?.content ?? ""; content += delta; if (delta) onDelta(delta); } catch { /* ignore malformed keep-alives */ } } if (part.done) break; }
    return { role: "assistant", content };
  }
  protected url(): string { return `${(this.options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "")}/chat/completions`; }
  protected headers(): Record<string, string> { return { ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}), "Content-Type": "application/json" }; }
  protected body(messages: Message[], tools: ToolDefinition[], stream: boolean): Record<string, unknown> { return { model: this.options.model, messages, tools, ...(tools.length ? { tool_choice: "auto" } : {}), stream }; }
  private async request(messages: Message[], tools: ToolDefinition[], stream: boolean): Promise<ApiResponse> { const response = await (this.options.fetch ?? fetch)(this.url(), { method: "POST", headers: this.headers(), body: JSON.stringify(this.body(messages, tools, stream)) }); const data = await response.json() as ApiResponse; if (!response.ok) throw new Error(`${this.options.name ?? "Provider"} request failed (${response.status}): ${data.error?.message ?? "unknown error"}`); return data; }
}
export class OpenRouterProvider extends OpenAICompatibleProvider { constructor(options: ProviderOptions = {}) { super({ ...options, apiKey: options.apiKey ?? process.env.OPENROUTER_API_KEY, model: options.model ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini", baseUrl: options.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1", name: "OpenRouter" }); } }
export class OpenAIProvider extends OpenAICompatibleProvider { constructor(options: ProviderOptions = {}) { super({ ...options, apiKey: options.apiKey ?? process.env.OPENAI_API_KEY, model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini", baseUrl: options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1", name: "OpenAI" }); } }
class NativeProvider implements Provider {
  constructor(private readonly kind: "anthropic" | "gemini", private readonly options: ProviderOptions) { if (!options.apiKey) throw new Error(`${kind} API key is required.`); }
  async complete(messages: Message[], tools: ToolDefinition[]): Promise<Message> {
    const system = messages.find(m => m.role === "system")?.content ?? ""; const input = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content ?? "" }] }));
    let url: string; let body: Record<string, unknown>; let headers: Record<string, string>;
    if (this.kind === "anthropic") { url = `${(this.options.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "")}/messages`; headers = { "x-api-key": this.options.apiKey!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }; body = { model: this.options.model ?? "claude-3-5-sonnet-latest", max_tokens: 4096, system, messages: input, ...(tools.length ? { tools: tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })) } : {}) }; }
    else { url = `${(this.options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "")}/models/${this.options.model ?? "gemini-3-flash-preview"}:generateContent?key=${encodeURIComponent(this.options.apiKey!)}`; headers = { "Content-Type": "application/json" }; body = { contents: input, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), ...(tools.length ? { tools: [{ functionDeclarations: tools.map(t => ({ name: t.function.name, description: t.function.description, parameters: geminiSchema(t.function.parameters) })) }] } : {}) }; }
    const response = await (this.options.fetch ?? fetch)(url, { method: "POST", headers, body: JSON.stringify(body) }); const data = await response.json() as ApiResponse; if (!response.ok) throw new Error(`${this.kind} request failed (${response.status})`); const parts = data.candidates?.[0]?.content?.parts ?? []; const calls = parts.filter(part => part.functionCall?.name).map((part, index) => ({ id: `gemini-call-${index}`, type: "function" as const, function: { name: part.functionCall!.name!, arguments: JSON.stringify(part.functionCall!.args ?? {}) } })); const text = this.kind === "anthropic" ? data.content?.map(x => x.text ?? "").join("") : parts.map(x => x.text ?? "").join(""); return { role: "assistant", content: text ?? "", ...(calls.length ? { tool_calls: calls } : {}) };
  }
}
export class AnthropicProvider extends NativeProvider { constructor(options: ProviderOptions = {}) { super("anthropic", { ...options, apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY, model: options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest", baseUrl: options.baseUrl ?? process.env.ANTHROPIC_BASE_URL }); } }
export class GeminiProvider extends NativeProvider { constructor(options: ProviderOptions = {}) { super("gemini", { ...options, apiKey: options.apiKey ?? process.env.GEMINI_API_KEY, model: options.model ?? process.env.GEMINI_MODEL ?? "gemini-1.5-flash", baseUrl: options.baseUrl ?? process.env.GEMINI_BASE_URL }); } }
export function providerFromConfig(config: { provider?: string; apiKey?: string; model?: string; baseUrl?: string }): Provider {
  const provider = (config.provider ?? "openrouter").toLowerCase(); const env = provider.toUpperCase(); const options = { apiKey: config.apiKey ?? process.env[`${env}_API_KEY`], model: config.model, baseUrl: config.baseUrl };
  if (provider === "openrouter") return new OpenRouterProvider(options); if (provider === "openai") return new OpenAIProvider(options); if (provider === "anthropic") return new AnthropicProvider(options); if (provider === "gemini" || provider === "google") return new GeminiProvider(options); if (provider === "compatible" || provider === "local") return new OpenAICompatibleProvider({ ...options, name: "Compatible" }); throw new Error(`Unknown provider '${provider}'.`);
}
