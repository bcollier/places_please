/**
 * Error helpers: every error shown to the user goes through `toUserMessage` so screens never show
 * raw stack traces, SQL errors, or tokens.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code: string = 'app_error',
    public retryable = true,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

export function isCancelled(err: unknown): err is CancelledError {
  return err instanceof CancelledError;
}

export function toUserMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) {
    const msg = err.message || '';
    if (/network request failed|failed to fetch|network error|internet connection/i.test(msg)) {
      return "Can't reach the server. Check your internet connection and try again.";
    }
    if (/timed? ?out|timeout/i.test(msg)) return 'That took too long. Please try again.';
    if (/JWT|not authenticated|unauthorized|invalid claim/i.test(msg)) {
      return 'Your session expired. Please restart the app.';
    }
    if (/permission/i.test(msg)) return msg;
  }
  return fallback;
}

/** Retries an async operation with a short backoff. Use only for idempotent work. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 600): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof AppError && !err.retryable) throw err;
      if (isCancelled(err)) throw err;
      if (i < attempts - 1) await delay(baseDelayMs * (i + 1));
    }
  }
  throw lastErr;
}

export function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Rejects with an AppError if the promise doesn't settle in time. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = 'That took too long. Please try again.') {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AppError(message, 'timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
