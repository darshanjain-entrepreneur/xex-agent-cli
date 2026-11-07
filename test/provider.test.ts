import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider, GeminiProvider, OpenAIProvider, OpenRouterProvider } from "../src/provider.js";

const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

describe("provider adapters", () => {
  it.each([
    ["openrouter", OpenRouterProvider, "https://example.test/v1/chat/completions"],
    ["openai", OpenAIProvider, "https://example.test/v1/chat/completions"],
  ])("adapts %s without leaking secrets in errors", async (_name, Provider, url) => {
    const fetcher = reply({ choices: [{ message: { role: "assistant", content: "ok" } }] });
    const provider = new Provider({ apiKey: "test-secret", baseUrl: "https://example.test/v1", fetch: fetcher });
    await expect(provider.complete([{ role: "user", content: "hello" }], [])).resolves.toMatchObject({ content: "ok" });
    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-secret" }) }));
  });

  it("uses native Anthropic and Gemini response shapes", async () => {
    const anthropicFetch = reply({ content: [{ text: "anthropic" }] });
    await expect(new AnthropicProvider({ apiKey: "secret", baseUrl: "https://example.test", fetch: anthropicFetch }).complete([{ role: "user", content: "hi" }], [])).resolves.toMatchObject({ content: "anthropic" });
    const geminiFetch = reply({ candidates: [{ content: { parts: [{ text: "gemini" }] } }] });
    await expect(new GeminiProvider({ apiKey: "secret", baseUrl: "https://example.test", fetch: geminiFetch }).complete([{ role: "user", content: "hi" }], [])).resolves.toMatchObject({ content: "gemini" });
    expect(geminiFetch).toHaveBeenCalledOnce();
  });
});
