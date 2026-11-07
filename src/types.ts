export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Message {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface Provider {
  complete(messages: Message[], tools: ToolDefinition[]): Promise<Message>;
  stream?(messages: Message[], tools: ToolDefinition[], onDelta: (delta: string) => void): Promise<Message>;
}

export interface PermissionRequest {
  tool: string;
  input: Record<string, unknown>;
  reason?: string | undefined;
  classification?: "read" | "write" | "process" | "dangerous";
}

export type PermissionHandler = (request: PermissionRequest) => Promise<boolean>;

export type ApprovalMode = "prompt" | "safe" | "trusted" | "session";
