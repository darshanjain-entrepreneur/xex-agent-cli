import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.js";
import type { Message, Provider } from "../src/types.js";
import { allowAllPermissionHandler } from "../src/permissions.js";

describe("Agent", () => {
  it("executes tool calls until a final response", async () => {
    const responses: Message[] = [
      { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function", function: { name: "list_files", arguments: "{}" } }] },
      { role: "assistant", content: "done" }
    ];
    const provider: Provider = { complete: async () => responses.shift() as Message };
    await expect(new Agent(provider, allowAllPermissionHandler()).run("list")).resolves.toBe("done");
  });
});
