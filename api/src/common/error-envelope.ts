/**
 * Standard error response body returned by the global exception filter.
 *
 * Clients always see exactly these three fields — no stack traces,
 * no internal messages, no sensitive information.
 */
export interface ErrorEnvelope {
  error: {
    /** Stable machine-readable string, e.g. "BAD_REQUEST", "NOT_FOUND". */
    code: string;
    /** Human-readable explanation safe to surface to the caller. */
    message: string;
    /** Matches the X-Request-ID response header for support correlation. */
    request_id: string;
  };
}

