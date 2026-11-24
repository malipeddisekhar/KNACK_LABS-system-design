export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitOpenError extends Error {
  constructor() {
    super('Dependency circuit is open.');
    this.name = 'CircuitOpenError';
  }
}

export class DependencyTimeoutError extends Error {
  constructor(
    readonly dependency: string,
    readonly operation: string,
    readonly timeoutMs: number,
  ) {
    super('Dependency operation timed out.');
    this.name = 'DependencyTimeoutError';
  }
}

export class CircuitBreaker {
  private currentState: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;

  constructor(
    private readonly options: {
      failureThreshold: number;
      resetTimeoutMs: number;
      now?: () => number;
      onStateChange?: (from: CircuitState, to: CircuitState) => void;
    },
  ) {}

  get state(): CircuitState {
    return this.currentState;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = this.options.now ?? Date.now;
    if (this.currentState === 'open') {
      if (now() - this.openedAt < this.options.resetTimeoutMs) {
        throw new CircuitOpenError();
      }
      this.transition('half-open');
    }
    if (this.currentState === 'half-open' && this.probeInFlight) {
      throw new CircuitOpenError();
    }

    const isProbe = this.currentState === 'half-open';
    if (isProbe) this.probeInFlight = true;
    try {
      const result = await operation();
      this.failures = 0;
      if (isProbe) this.transition('closed');
      return result;
    } catch (error) {
      if (isProbe) {
        this.openedAt = now();
        this.transition('open');
      } else {
        this.failures += 1;
        if (this.failures >= this.options.failureThreshold) {
          this.openedAt = now();
          this.transition('open');
        }
      }
      throw error;
    } finally {
      if (isProbe) this.probeInFlight = false;
    }
  }

  private transition(next: CircuitState): void {
    const previous = this.currentState;
    if (previous === next) return;
    this.currentState = next;
    this.options.onStateChange?.(previous, next);
  }
}

const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
]);

export const MAX_TRANSIENT_RETRIES = 5;

export function safeErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'UNKNOWN';
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && /^[A-Z0-9_]{2,32}$/.test(code)) return code;
  const cause = 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
  if (cause !== error && typeof cause === 'object' && cause !== null && 'code' in cause) {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === 'string' && /^[A-Z0-9_]{2,32}$/.test(causeCode)) {
      return causeCode;
    }
  }
  return 'UNKNOWN';
}

export function isTransientDependencyError(error: unknown): boolean {
  return TRANSIENT_CODES.has(safeErrorCode(error));
}

const TRANSIENT_DATABASE_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);

export function isTransientDatabaseError(error: unknown): boolean {
  return isTransientDependencyError(error) || TRANSIENT_DATABASE_CODES.has(safeErrorCode(error));
}

export async function retryTransient<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    random?: () => number;
    sleep?: (delayMs: number) => Promise<void>;
    onRetry?: (attempt: number, delayMs: number, errorCode: string) => void;
  },
): Promise<T> {
  if (!Number.isFinite(options.maxRetries) || !Number.isInteger(options.maxRetries) || options.maxRetries < 0) {
    throw new RangeError('maxRetries must be a finite non-negative integer.');
  }
  const maxRetries = Math.min(options.maxRetries, MAX_TRANSIENT_RETRIES);
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt > maxRetries || !isTransientDependencyError(error)) throw error;
      const ceiling = Math.min(options.initialDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
      const randomValue = Math.min(Math.max(random(), 0), 0.9999999999);
      const delayMs = Math.floor(randomValue * (ceiling + 1));
      options.onRetry?.(attempt, delayMs, safeErrorCode(error));
      await sleep(delayMs);
    }
  }
}

export async function withDependencyTimeout<T>(
  operation: () => Promise<T>,
  dependency: string,
  operationName: string,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = operation();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new DependencyTimeoutError(dependency, operationName, timeoutMs)),
        timeoutMs,
      );
    });
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
