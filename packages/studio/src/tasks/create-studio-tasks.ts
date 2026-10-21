// Builds Studio tasks over one repository and one compiled workflow executor.

import type { StudioConfig } from "../config/types";
import { GenerationRepository } from "../server/generation-repository";
import { createGenerateRequestTask } from "./generate-request";
import { createGenerateTitleTask } from "./generate-title";
import { createGenerationRunTask } from "./generation-run";
import { createNotifyGenerationTask } from "./notify-generation";
import { WorkflowExecution } from "./runpod-client";

export const createStudioTasks = (config: StudioConfig) => {
  const queries = new GenerationRepository(config);
  const workflowExecution = new WorkflowExecution(config);

  const notifyGeneration = createNotifyGenerationTask(config);
  const generateTitle = createGenerateTitleTask(config, queries);
  const generationRun = createGenerationRunTask(
    config,
    queries,
    notifyGeneration,
    workflowExecution
  );
  const generateRequest = createGenerateRequestTask(
    config,
    queries,
    generationRun,
    generateTitle
  );

  return {
    generateRequest,
    generateTitle,
    generationRun,
    notifyGeneration,
  };
};

export type StudioTasks = ReturnType<typeof createStudioTasks>;
