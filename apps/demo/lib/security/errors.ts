export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, message: string, code = "REQUEST_REJECTED") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
