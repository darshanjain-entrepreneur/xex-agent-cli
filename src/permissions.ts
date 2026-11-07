import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ApprovalMode, PermissionHandler, PermissionRequest } from "./types.js";

export function interactivePermissionHandler(): PermissionHandler {
  return async (request: PermissionRequest) => {
    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question(`\nPermission required [${request.classification ?? "write"}]: ${request.tool} ${JSON.stringify(request.input)}\n${request.reason ?? ""}\nAllow? [y/N] `);
      return /^y(es)?$/i.test(answer.trim());
    } finally { rl.close(); }
  };
}

export function allowAllPermissionHandler(): PermissionHandler {
  return async () => true;
}

export function approvalHandler(mode: ApprovalMode): PermissionHandler {
  if (mode === "trusted") return allowAllPermissionHandler();
  const session = new Set<string>();
  return async (request) => {
    if (mode === "safe" && request.classification !== "read") return false;
    const key = `${request.tool}:${JSON.stringify(request.input)}`;
    if (mode === "session" && session.has(key)) return true;
    const allowed = await interactivePermissionHandler()(request);
    if (allowed && mode === "session") session.add(key);
    return allowed;
  };
}
