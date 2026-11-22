import { CancelledError } from '@/lib/errors';

/** Cooperative cancellation for long-running audio sequences. */
export class Cancellation {
  private _cancelled = false;
  private handlers = new Set<() => void>();

  get cancelled() {
    return this._cancelled;
  }

  cancel() {
    if (this._cancelled) return;
    this._cancelled = true;
    for (const h of this.handlers) {
      try {
        h();
      } catch {
        // ignore handler failures
      }
    }
    this.handlers.clear();
  }

  /** Registers a handler; returns an unsubscribe function. Runs immediately if already cancelled. */
  onCancel(handler: () => void): () => void {
    if (this._cancelled) {
      handler();
      return () => {};
    }
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  throwIfCancelled() {
    if (this._cancelled) throw new CancelledError();
  }
}

/** A delay that ends early (rejecting) when cancelled. */
export function cancellableDelay(ms: number, token: Cancellation): Promise<void> {
  return new Promise((resolve, reject) => {
    if (token.cancelled) return reject(new CancelledError());
    const timer = setTimeout(() => {
      off();
      resolve();
    }, ms);
    const off = token.onCancel(() => {
      clearTimeout(timer);
      reject(new CancelledError());
    });
  });
}
