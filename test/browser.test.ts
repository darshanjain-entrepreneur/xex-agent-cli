import { describe, expect, it } from "vitest";
import { assertSafeBrowserUrl } from "../src/browser.js";

describe("browser network policy", () => {
  it("blocks loopback, private, and metadata destinations", async () => {
    await expect(assertSafeBrowserUrl("http://127.0.0.1")).rejects.toThrow("private");
    await expect(assertSafeBrowserUrl("http://[::ffff:127.0.0.1]")).rejects.toThrow("private");
    await expect(assertSafeBrowserUrl("http://[::ffff:169.254.169.254]")).rejects.toThrow("private");
    await expect(assertSafeBrowserUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow("private");
    await expect(assertSafeBrowserUrl("http://192.168.1.1")).rejects.toThrow("private");
  });

  it("blocks embedded credentials and non-http protocols", async () => {
    await expect(assertSafeBrowserUrl("https://user:pass@example.com")).rejects.toThrow("credentials");
    await expect(assertSafeBrowserUrl("file:///etc/passwd")).rejects.toThrow("http or https");
  });
});
