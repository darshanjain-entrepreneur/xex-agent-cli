import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConversationHistory, searchHistory } from "../src/history.js";

const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))); });

describe("conversation history", () => {
  it("writes atomically and rejects malformed messages", async () => {
    const directory = await fs.mkdtemp(path.join(process.cwd(), "history-test-")); created.push(directory);
    const file = path.join(directory, "conversation.json");
    const history = new ConversationHistory(file);
    await history.save([{ role: "user", content: "remember this" }]);
    expect(await history.search("REMEMBER")).toHaveLength(1);
    await fs.writeFile(file, "{\"not\":\"history\"}");
    expect(await history.load()).toEqual([]);
  });

  it("searches valid histories and ignores invalid JSON", async () => {
    const directory = await fs.mkdtemp(path.join(process.cwd(), "history-search-")); created.push(directory);
    await fs.writeFile(path.join(directory, "one.json"), JSON.stringify([{ role: "assistant", content: "needle" }]));
    await fs.writeFile(path.join(directory, "bad.json"), "not json");
    expect((await searchHistory(directory, "needle")).map(result => path.basename(result.file))).toEqual(["one.json"]);
  });
});
