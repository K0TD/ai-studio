export class RouterAIError extends Error {
  status: number;
  details?: string;
  uncertain: boolean;
  constructor(
    message: string,
    status: number,
    details?: string,
    uncertain = false
  ) {
    super(message);
    this.name = "RouterAIError";
    this.status = status;
    this.details = details;
    this.uncertain = uncertain;
  }
}
