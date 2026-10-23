export interface ProviderFailureContext {
  generationId?: string;
  cost?: number;
  diagnostic?: {
    endpoint: string;
    status: number;
    responseKeys?: string[];
    finishReasons?: string[];
  };
}

export class RouterAIError extends Error {
  status: number;
  details?: string;
  uncertain: boolean;
  context?: ProviderFailureContext;
  constructor(
    message: string,
    status: number,
    details?: string,
    uncertain = false,
    context?: ProviderFailureContext
  ) {
    super(message);
    this.name = "RouterAIError";
    this.status = status;
    this.details = details;
    this.uncertain = uncertain;
    this.context = context;
  }
}
