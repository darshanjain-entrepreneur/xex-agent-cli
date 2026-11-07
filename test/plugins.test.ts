import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installPlugin, inspectPlugins } from "../src/plugins.js";

const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))); });

describe("plugin management", () => {
  it("installs and validates a local plugin", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), "plugin-test-")); created.push(root);
    const source = path.join(root, "safe.mjs");
    const destination = path.join(root, "plugins");
    await fs.writeFile(source, "export default [{definition:{type:'function',function:{name:'hello',description:'hello',parameters:{type:'object'}}},execute:async()=> 'ok'}];");
    await expect(installPlugin(source, destination)).resolves.toBe(path.join(destination, "safe.mjs"));
    await expect(inspectPlugins(destination)).resolves.toMatchObject([{ file: "safe.mjs", valid: false, tools: [] }]);
  });

  it("rejects remote plugin sources", async () => {
    await expect(installPlugin("https://example.test/plugin.mjs", "plugins")).rejects.toThrow("local file");
  });

  it("does not execute plugins while listing them", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), "plugin-test-")); created.push(root);
    const pluginDir = path.join(root, "plugins"); await fs.mkdir(pluginDir);
    await fs.writeFile(path.join(pluginDir, "untrusted.mjs"), "throw new Error('plugin executed');");
    await expect(inspectPlugins(pluginDir)).resolves.toMatchObject([{ file: "untrusted.mjs", valid: false }]);
  });
});
