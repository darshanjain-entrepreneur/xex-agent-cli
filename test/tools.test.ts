import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTools, type AgentTool } from "../src/tools.js";
import { allowAllPermissionHandler } from "../src/permissions.js";

const temporaryDirectories: string[] = [];

async function createContext(): Promise<{ root: string; tools: AgentTool[] }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "computer-agent-"));
  temporaryDirectories.push(root);
  return { root, tools: createTools() };
}

function tool(tools: AgentTool[], name: string): AgentTool {
  const found = tools.find((candidate) => candidate.definition.function.name === name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found;
}

async function execute(tools: AgentTool[], name: string, input: Record<string, unknown>, root: string): Promise<Record<string, unknown>> {
  const output = await tool(tools, name).execute(input, {
    cwd: root,
    permissions: allowAllPermissionHandler(),
    commandTimeoutMs: 10_000
  });
  return JSON.parse(output) as Record<string, unknown>;
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    await fs.rm(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("computer tools", () => {
  it("creates directories and files, then reads and edits them", async () => {
    const { root, tools } = await createContext();
    await execute(tools, "create_file", { path: "demo/hello.txt", content: "Hello world" }, root);
    expect(await fs.stat(path.join(root, "demo"))).toBeTruthy();
    expect((await execute(tools, "read_file", { path: "demo/hello.txt" }, root)).content).toBe("Hello world");
    await execute(tools, "edit_file", { path: "demo/hello.txt", oldText: "world", newText: "agent" }, root);
    expect(await fs.readFile(path.join(root, "demo/hello.txt"), "utf8")).toBe("Hello agent");
  });

  it("lists, copies, moves, and searches files", async () => {
    const { root, tools } = await createContext();
    await execute(tools, "create_file", { path: "one.txt", content: "needle" }, root);
    const listing = await execute(tools, "list_files", { path: "." }, root);
    expect(JSON.stringify(listing.entries)).toContain("one.txt");
    await execute(tools, "copy", { source: "one.txt", destination: "copy.txt" }, root);
    await execute(tools, "move", { source: "copy.txt", destination: "moved.txt" }, root);
    const search = await execute(tools, "search", { query: "needle" }, root);
    expect(JSON.stringify(search.matches)).toContain("moved.txt");
  });

  it("runs a harmless process and returns structured output", async () => {
    const { root, tools } = await createContext();
    const result = await execute(tools, "run_process", {
      command: process.execPath,
      args: ["-e", "process.stdout.write('tool-ok')"]
    }, root);
    expect(result).toMatchObject({ ok: true, exitCode: 0, stdout: "tool-ok" });
  });

  it("rejects malformed arguments and denied dangerous actions", async () => {
    const { root, tools } = await createContext();
    await expect(tool(tools, "read_file").execute({}, {
      cwd: root,
      permissions: allowAllPermissionHandler(),
      commandTimeoutMs: 10_000
    })).rejects.toThrow("path must be a non-empty string");

    let asked = false;
    const denied = await tool(tools, "delete").execute({ path: "missing.txt" }, {
      cwd: root,
      permissions: async () => {
        asked = true;
        return false;
      },
      commandTimeoutMs: 10_000
    }).catch((error: unknown) => error);
    expect(asked).toBe(true);
    expect(denied).toBeInstanceOf(Error);
    expect((denied as Error).message).toContain("Permission denied");
  });

  it("does not allow a relative path to escape the selected working directory", async () => {
    const { root, tools } = await createContext();
    await expect(tool(tools, "read_file").execute({ path: "..\\outside.txt" }, {
      cwd: root,
      permissions: allowAllPermissionHandler(),
      commandTimeoutMs: 10_000
    })).rejects.toThrow("Path must stay within");
  });
});
