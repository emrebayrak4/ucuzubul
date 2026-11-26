/** Typed adapter errors. Callers can switch on `code`. */

export class AdapterError extends Error {
  readonly code: string;
  readonly adapterId: string;
  constructor(code: string, adapterId: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.adapterId = adapterId;
  }
}

/** Thrown by every fetch method when required credentials are missing. Never returns fake data instead. */
export class PendingConfigurationError extends AdapterError {
  readonly missingEnv: string[];
  constructor(adapterId: string, missingEnv: string[]) {
    super("PENDING_CONFIGURATION", adapterId, `Adapter "${adapterId}" is pending configuration; missing env: ${missingEnv.join(", ")}`);
    this.missingEnv = missingEnv;
  }
}

/** The provider has shut down the product/API (e.g. Hotellook, Amadeus Self-Service). */
export class ProviderDiscontinuedError extends AdapterError {
  constructor(adapterId: string, detail: string) {
    super("PROVIDER_DISCONTINUED", adapterId, `Provider "${adapterId}" is discontinued: ${detail}`);
  }
}

/** The provider does not offer this operation (e.g. city search on a property-id-only API). */
export class NotSupportedError extends AdapterError {
  constructor(adapterId: string, operation: string, detail = "") {
    super("NOT_SUPPORTED", adapterId, `Adapter "${adapterId}" does not support ${operation}${detail ? `: ${detail}` : ""}`);
  }
}

export class AdapterHttpError extends AdapterError {
  readonly status: number;
  readonly retryable: boolean;
  readonly bodySnippet: string;
  constructor(adapterId: string, status: number, bodySnippet: string, retryable: boolean) {
    super("HTTP_ERROR", adapterId, `Adapter "${adapterId}" received HTTP ${status}`);
    this.status = status;
    this.retryable = retryable;
    this.bodySnippet = bodySnippet.slice(0, 500);
  }
}

export class AdapterTimeoutError extends AdapterError {
  constructor(adapterId: string, timeoutMs: number) {
    super("TIMEOUT", adapterId, `Adapter "${adapterId}" request timed out after ${timeoutMs}ms`);
  }
}

export class CircuitOpenError extends AdapterError {
  readonly retryAt: number;
  constructor(adapterId: string, retryAt: number) {
    super("CIRCUIT_OPEN", adapterId, `Adapter "${adapterId}" circuit is open until ${new Date(retryAt).toISOString()}`);
    this.retryAt = retryAt;
  }
}

export class ResponseShapeError extends AdapterError {
  constructor(adapterId: string, detail: string) {
    super("RESPONSE_SHAPE", adapterId, `Adapter "${adapterId}" got an unexpected response shape: ${detail}`);
  }
}
