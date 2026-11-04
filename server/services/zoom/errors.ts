/** What went wrong with Zoom, and whether trying again could help. */
export type ZoomErrorKind = "auth" | "rate_limit" | "not_found" | "validation" | "transport" | "server" | "not_configured";

const RETRYABLE: ReadonlySet<ZoomErrorKind> = new Set(["rate_limit", "transport", "server"]);

export class ZoomError extends Error {
  readonly kind: ZoomErrorKind;
  readonly statusCode: number | null;
  readonly retryAfterMs: number | null;

  constructor(kind: ZoomErrorKind, message: string, opts: { statusCode?: number | null; retryAfterMs?: number | null } = {}) {
    super(message);
    this.name = "ZoomError";
    this.kind = kind;
    this.statusCode = opts.statusCode ?? null;
    this.retryAfterMs = opts.retryAfterMs ?? null;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }

  static fromResponse(status: number, body: unknown, retryAfter?: string | null): ZoomError {
    const message = (body as { message?: string } | null)?.message || `Zoom answered ${status}.`;
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : null;
    if (status === 401 || status === 403) return new ZoomError("auth", message, { statusCode: status });
    if (status === 404) return new ZoomError("not_found", message, { statusCode: status });
    if (status === 429) return new ZoomError("rate_limit", message, { statusCode: status, retryAfterMs });
    if (status >= 500) return new ZoomError("server", message, { statusCode: status, retryAfterMs });
    return new ZoomError("validation", message, { statusCode: status });
  }

  static fromTransport(cause: unknown): ZoomError {
    const timedOut = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
    return new ZoomError("transport", timedOut ? "Zoom didn't answer in time." : "Couldn't reach Zoom.");
  }
}

/** A short reason an admin can read, without Zoom's internals. */
export function zoomErrorSummary(err: unknown): string {
  if (!(err instanceof ZoomError)) return "Zoom couldn't be reached.";
  switch (err.kind) {
    case "not_configured":
      return "Zoom isn't connected yet. Add the Zoom credentials to the server.";
    case "auth":
      return "Zoom refused Hadafi's credentials. Check the Zoom app and host user.";
    case "validation":
      return `Zoom rejected the request: ${err.message.slice(0, 160)}`;
    case "not_found":
      return "Zoom couldn't find that meeting.";
    case "rate_limit":
      return "Zoom asked Hadafi to slow down. It will try again shortly.";
    default:
      return "Zoom couldn't be reached. Hadafi will try again shortly.";
  }
}
