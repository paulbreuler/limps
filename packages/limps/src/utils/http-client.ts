/**
 * Shared HTTP client utilities for daemon health checks.
 * Provides typed error handling, retry logic, and debug logging.
 */

import { request as httpRequest } from 'http';

/**
 * Error codes for HTTP operations.
 */
export type HttpErrorCode =
  | 'NETWORK_ERROR' // Connection failed, DNS error
  | 'TIMEOUT' // Request timed out
  | 'NON_200_STATUS' // Server returned non-200 status
  | 'INVALID_RESPONSE'; // JSON parsing failed or missing required fields

/**
 * HTTP error details.
 */
export interface HttpError {
  code: HttpErrorCode;
  message: string;
  details?: unknown;
  statusCode?: number;
}

/**
 * Result type for HTTP operations (discriminated union).
 */
export type HttpResult<T> =
  | { ok: true; data: T; statusCode: number }
  | { ok: false; error: HttpError };

/**
 * Health check response schema.
 */
export interface HealthCheckResponse {
  status: string;
  sessions: number;
  uptime: number;
  pid: number;
  sessionTimeoutMs?: number;
  version?: string;
  name?: string;
}

/**
 * HTTP client configuration options.
 */
export interface HttpClientOptions {
  /** Request timeout in milliseconds (default: 3000) */
  timeout?: number;
  /** Number of retry attempts (default: 0) */
  retries?: number;
  /** Delay between retries in milliseconds (default: 500) */
  retryDelay?: number;
  /** Error codes that trigger retries (default: ['NETWORK_ERROR', 'TIMEOUT']) */
  retryOn?: HttpErrorCode[];
  /** Optional logger function for debugging */
  logger?: (msg: string) => void;
}

/**
 * Validate that a parsed JSON object matches the HealthCheckResponse schema.
 */
function validateHealthResponse(data: unknown): data is HealthCheckResponse {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;
  return (
    typeof obj.status === 'string' &&
    typeof obj.sessions === 'number' &&
    typeof obj.uptime === 'number' &&
    typeof obj.pid === 'number' &&
    (obj.sessionTimeoutMs === undefined || typeof obj.sessionTimeoutMs === 'number')
  );
}

/**
 * Make a single HTTP GET request to the health endpoint.
 */
function makeHealthRequest(
  host: string,
  port: number,
  timeoutMs: number,
  logger?: (msg: string) => void
): Promise<HttpResult<HealthCheckResponse>> {
  return new Promise((resolve) => {
    const url = `http://${host}:${port}/health`;
    const startTime = Date.now();
    logger?.(`HTTP GET ${url}`);

    const req = httpRequest(
      {
        hostname: host,
        port,
        method: 'GET',
        path: '/health',
        timeout: timeoutMs,
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        let body = '';

        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });

        res.on('end', () => {
          const duration = Date.now() - startTime;
          logger?.(`HTTP ${statusCode} in ${duration}ms`);

          if (statusCode !== 200) {
            resolve({
              ok: false,
              error: {
                code: 'NON_200_STATUS',
                message: `Health endpoint returned status ${statusCode}`,
                statusCode,
                details: body,
              },
            });
            return;
          }

          try {
            const data = JSON.parse(body) as unknown;

            if (!validateHealthResponse(data)) {
              resolve({
                ok: false,
                error: {
                  code: 'INVALID_RESPONSE',
                  message: 'Health response missing required fields or has invalid types',
                  details: data,
                },
              });
              return;
            }

            resolve({
              ok: true,
              data,
              statusCode,
            });
          } catch (err) {
            resolve({
              ok: false,
              error: {
                code: 'INVALID_RESPONSE',
                message: 'Failed to parse JSON response',
                details: err instanceof Error ? err.message : String(err),
              },
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      const duration = Date.now() - startTime;
      logger?.(`HTTP error after ${duration}ms: ${err.message}`);
      resolve({
        ok: false,
        error: {
          code: 'NETWORK_ERROR',
          message: err.message,
          details: err,
        },
      });
    });

    req.on('timeout', () => {
      const duration = Date.now() - startTime;
      logger?.(`HTTP timeout after ${duration}ms`);
      req.destroy();
      resolve({
        ok: false,
        error: {
          code: 'TIMEOUT',
          message: `Request timed out after ${timeoutMs}ms`,
        },
      });
    });

    req.end();
  });
}

/**
 * Check daemon health with retry logic and typed error handling.
 *
 * @param host - Daemon host address
 * @param port - Daemon port number
 * @param options - HTTP client options
 * @returns Promise resolving to HttpResult with health data or error details
 */
export async function checkDaemonHealth(
  host: string,
  port: number,
  options: HttpClientOptions = {}
): Promise<HttpResult<HealthCheckResponse>> {
  const {
    timeout = 3000,
    retries = 0,
    retryDelay = 500,
    retryOn = ['NETWORK_ERROR', 'TIMEOUT'],
    logger,
  } = options;

  let lastResult: HttpResult<HealthCheckResponse> | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      logger?.(`Retry attempt ${attempt}/${retries} after ${retryDelay}ms delay`);
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
    }

    const result = await makeHealthRequest(host, port, timeout, logger);

    if (result.ok) {
      return result;
    }

    lastResult = result;

    // Don't retry if error code is not in retryOn list
    if (!retryOn.includes(result.error.code)) {
      logger?.(`Not retrying error code: ${result.error.code}`);
      break;
    }

    // Don't retry on last attempt
    if (attempt === retries) {
      break;
    }
  }

  // TypeScript knows lastResult is non-null here because we always enter the loop at least once (attempt = 0)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return lastResult!;
}

/**
 * Simple boolean wrapper for daemon health check (backwards compatible).
 *
 * @param host - Daemon host address
 * @param port - Daemon port number
 * @param options - HTTP client options
 * @returns Promise resolving to true if daemon is healthy, false otherwise
 */
export async function isDaemonHealthy(
  host: string,
  port: number,
  options: HttpClientOptions = {}
): Promise<boolean> {
  const result = await checkDaemonHealth(host, port, options);
  return result.ok && result.data.status === 'ok';
}
