import { promises as dns } from "node:dns";

type Route = { request(): { url(): string }; continue(): Promise<void>; abort(): Promise<void> };
type Page = { route(pattern: string, handler: (route: Route) => Promise<void>): Promise<void>; goto(url: string): Promise<unknown>; title(): Promise<string>; content(): Promise<string>; click(selector: string): Promise<unknown>; fill(selector: string, value: string): Promise<unknown>; screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer> };
type Browser = { newPage(): Promise<Page>; close(): Promise<void> };
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
function privateIpv4(value: string): boolean {
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const a = octets[0] ?? -1;
  const b = octets[1] ?? -1;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function privateIpv6(value: string): boolean {
  const normalized = value.toLowerCase();
  const mappedIpv4 = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  const mappedHexIpv4 = mappedHex ? `${parseInt(mappedHex[1] ?? "0", 16) >> 8}.${parseInt(mappedHex[1] ?? "0", 16) & 255}.${parseInt(mappedHex[2] ?? "0", 16) >> 8}.${parseInt(mappedHex[2] ?? "0", 16) & 255}` : undefined;
  return (mappedIpv4 !== undefined && privateIpv4(mappedIpv4)) || (mappedHexIpv4 !== undefined && privateIpv4(mappedHexIpv4)) || normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}
export async function assertSafeBrowserUrl(value: string): Promise<void> {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Browser URL is invalid."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Browser URLs must use http or https without embedded credentials.");
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || privateIpv4(hostname) || privateIpv6(hostname)) throw new Error("Browser access to local, private, link-local, or reserved hosts is blocked.");
  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(address => privateIpv4(address.address) || privateIpv6(address.address))) throw new Error("Browser access to a private or reserved network address is blocked.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("private or reserved")) throw error;
    throw new Error("Browser hostname could not be resolved safely.");
  }
}
async function page(): Promise<{ browser: Browser; page: Page }> {
  try {
    const p = await dynamicImport("playwright") as { chromium: { launch(o: { headless: boolean }): Promise<Browser> } };
    const browser = await p.chromium.launch({ headless: true });
    const browserPage = await browser.newPage();
    await browserPage.route("**/*", async route => {
      try { await assertSafeBrowserUrl(route.request().url()); await route.continue(); }
      catch { await route.abort(); }
    });
    return { browser, page: browserPage };
  }
  catch { throw new Error("Browser automation is unavailable: install optional dependency 'playwright' (npm install playwright)."); }
}
export async function browserAvailable(): Promise<boolean> { try { await dynamicImport("playwright"); return true; } catch { return false; } }
export async function browserAction(action: "open" | "read" | "click" | "type" | "screenshot", input: { url?: string; selector?: string; text?: string; path?: string }): Promise<Record<string, unknown>> {
  if (input.url) await assertSafeBrowserUrl(input.url);
  const { browser, page: p } = await page(); try { if (input.url) await p.goto(input.url); if (action === "open") return { ok: true, title: await p.title() }; if (action === "read") return { ok: true, title: await p.title(), content: (await p.content()).slice(0, 20000) }; if (action === "click") { if (!input.selector) throw new Error("selector is required"); await p.click(input.selector); return { ok: true }; } if (action === "type") { if (!input.selector || input.text === undefined) throw new Error("selector and text are required"); await p.fill(input.selector, input.text); return { ok: true }; } if (action === "screenshot") { const options: { fullPage: boolean; path?: string } = { fullPage: true }; if (input.path) options.path = input.path; const data = await p.screenshot(options); return { ok: true, path: input.path, ...(input.path ? {} : { base64: data.toString("base64") }) }; } return { ok: false }; } finally { await browser.close(); }
}
export async function openBrowser(url: string): Promise<unknown> { return browserAction("open", { url }); }
