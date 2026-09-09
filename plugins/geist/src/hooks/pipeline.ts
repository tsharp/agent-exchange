export const EVENTS = ["SessionStart", "UserPromptSubmit", "SubagentStart", "SubagentStop", "Stop", "SessionEnd", "PreCompact"] as const;

export type Host = "copilot" | "codex";
export type EventName = typeof EVENTS[number];
export type HookInput = Record<string, unknown>;

export type HookRequest = {
  host: Host;
  event: EventName;
  input: HookInput;
  workspace: string;
};

export type HookResponse = {
  instructions: string[];
  context: string[];
  decision?: "block";
  reason?: string;
};

export type HookStage = {
  name: string;
  run(request: HookRequest, response: HookResponse): void | Promise<void>;
};

export type HookPipeline = {
  run(request: HookRequest): Promise<HookResponse>;
};

export function createHookPipeline(stages: readonly HookStage[]): HookPipeline {
  return {
    async run(request) {
      const response: HookResponse = { instructions: [], context: [] };
      for (const stage of stages) {
        await stage.run(request, response);
        if (response.decision === "block") break;
      }
      return response;
    },
  };
}

export function appendInstructions(response: HookResponse, value: string): void {
  const content = value.trim();
  if (content && !response.instructions.includes(content)) response.instructions.push(content);
}

export function appendContext(response: HookResponse, value: string): void {
  const content = value.trim();
  if (content && !response.context.includes(content)) response.context.push(content);
}

export function blockRequest(response: HookResponse, reason: string): void {
  const content = reason.trim();
  if (!content) throw new Error("a blocked hook request requires a reason");
  response.decision = "block";
  response.reason = content;
}

export function stringField(input: HookInput, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = input[name];
    if (typeof value === "string" && value.length > 0) return value;
  }

  return undefined;
}
