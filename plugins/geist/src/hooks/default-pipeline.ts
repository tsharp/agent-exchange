import { createHookPipeline, type HookPipeline, type HookStage } from "./pipeline.ts";
import { externalControllerFromEnvironment } from "./stages/external-controller.ts";
import { injectWorkspaceContext } from "./stages/workspace-context.ts";

export function createDefaultPipeline(additionalStages: readonly HookStage[] = []): HookPipeline {
  const controller = externalControllerFromEnvironment();
  return createHookPipeline([
    injectWorkspaceContext,
    ...additionalStages,
    ...(controller ? [controller] : []),
  ]);
}
