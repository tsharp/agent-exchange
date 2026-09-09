#!/usr/bin/env node

import process from "node:process";

import { createDefaultPipeline } from "./default-pipeline.ts";
import { EVENTS, stringField, type EventName, type HookInput, type HookResponse, type Host } from "./pipeline.ts";

const [hostArgument, eventArgument] = process.argv.slice(2);

function isHost(value: string | undefined): value is Host {
  return value === "copilot" || value === "codex";
}

function isEvent(value: string | undefined): value is EventName {
  return EVENTS.some((eventName) => eventName === value);
}

if (!isHost(hostArgument) || !isEvent(eventArgument)) {
  console.error("Usage: run.ts <copilot|codex> <event>");
  process.exit(1);
}

const host = hostArgument;
const event = eventArgument;

function readInput(timeoutMs = 500): Promise<HookInput> {
  return new Promise((resolveInput) => {
    let input = "";
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", finish);
      process.stdin.removeListener("error", finish);
      process.stdin.pause();

      try {
        const parsed: unknown = JSON.parse(input.replace(/^\uFEFF/, ""));
        resolveInput(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as HookInput : {});
      } catch {
        resolveInput({});
      }
    };

    const onData = (chunk: Buffer | string) => {
      input += chunk;
    };

    const timer = setTimeout(finish, timeoutMs);
    process.stdin.on("data", onData);
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    process.stdin.resume();
  });
}

function workspaceDirectory(input: HookInput): string {
  return process.env.GEIST_WORKSPACE_DIR || stringField(input, "cwd") || process.cwd();
}

function renderedContext(response: HookResponse): string {
  return [...response.instructions, ...response.context].join("\n\n");
}

function contextOutput(response: HookResponse): Record<string, unknown> {
  const context = renderedContext(response);
  const control = response.decision === "block"
    ? {
        decision: "block",
        reason: [response.reason, context].filter(Boolean).join("\n\n"),
      }
    : {};
  if (event === "Stop" || event === "SubagentStop" || event === "SessionEnd") return control;
  if (!context) return control;

  if (host === "codex") {
    return {
      ...control,
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext: context,
      },
    };
  }

  return { ...control, additionalContext: context };
}

const input = await readInput();
const pipeline = createDefaultPipeline();
const response = await pipeline.run({ host, event, input, workspace: workspaceDirectory(input) });

process.stdout.write(JSON.stringify(contextOutput(response)));
