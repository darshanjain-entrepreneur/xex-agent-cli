import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";

export interface SandboxCapabilities {
  platform: NodeJS.Platform;
  osSandboxAvailable: boolean;
  mechanism: "windows-job" | "linux-namespace" | "macos-sandbox" | "none";
  reason: string;
}

/** Detects real host capabilities; it never claims that an application policy is a sandbox. */
export async function detectSandboxCapabilities(): Promise<SandboxCapabilities> {
  if (process.platform === "win32") {
    try {
      await fs.access(process.env.SystemRoot ?? "C:\\Windows", fsConstants.F_OK);
      return { platform: process.platform, osSandboxAvailable: false, mechanism: "none", reason: "Windows Job Objects require a native supervisor; application policy remains fail-closed." };
    } catch { /* continue */ }
  }
  if (process.platform === "linux") {
    try {
      await fs.access("/proc/self/ns", fsConstants.R_OK);
      return { platform: process.platform, osSandboxAvailable: false, mechanism: "none", reason: "Namespace isolation is not enabled by this process; use an external sandbox." };
    } catch { /* continue */ }
  }
  return { platform: process.platform, osSandboxAvailable: false, mechanism: "none", reason: "No verified OS sandbox is active." };
}

export function safeDenylist(): string[] {
  return os.platform() === "win32"
    ? ["format", "shutdown", "reboot", "diskpart", "del", "rd", "rmdir", "cipher"]
    : ["format", "shutdown", "reboot", "mkfs", "fdisk", "dd", "rm"];
}
