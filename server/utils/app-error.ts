/**
 * AppError — structured error class used throughout the server.
 *
 * Throwing an AppError signals a known, expected failure (e.g. 404, 409).
 * The global error-handler middleware converts these into the standard
 * `{ success: false, error: { message, code } }` response shape.
 */
export class AppError extends Error {
  /** HTTP status code to send in the response. */
  public readonly statusCode: number;
  /** Machine-readable error code (e.g. "NOT_FOUND", "EMAIL_EXISTS"). */
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    // Maintains a proper prototype chain in transpiled ES5 output.
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
