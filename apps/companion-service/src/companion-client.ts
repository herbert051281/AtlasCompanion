// apps/companion-service/src/companion-client.ts
// HTTP Client for Atlas Companion Service with retry logic and timeout handling

import http from 'node:http';
import https from 'node:https';

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type CompanionClientOptions = {
  timeout?: number;   // Request timeout in ms (default: 10000)
  retries?: number;   // Max retry attempts (default: 3)
};

export class CompanionClient {
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(baseUrl: string, options?: CompanionClientOptions) {
    this.baseUrl = baseUrl;
    this.timeout = options?.timeout ?? 10000;
    this.maxRetries = options?.retries ?? 3;
  }

  /**
   * Execute a primitive (mouse.move, keyboard.type, etc.)
   */
  async executePrimitive(
    primitive: string,
    params: Record<string, unknown>,
    approved: boolean
  ): Promise<CommandResult> {
    return this.executeWithRetry<CommandResult>(async () => {
      return this.post('/execute-primitive', {
        primitive,
        params,
        approved,
      });
    });
  }

  /**
   * Execute an operation (app.launch, window.focus, etc.)
   */
  async executeOperation(
    operation: string,
    params: Record<string, unknown>,
    approved: boolean
  ): Promise<CommandResult> {
    return this.executeWithRetry<CommandResult>(async () => {
      return this.post('/execute-operation', {
        operation,
        params,
        approved,
      });
    });
  }

  /**
   * Get list of available primitives
   */
  async listPrimitives(): Promise<string[]> {
    const result = await this.executeWithRetry<{ primitives?: string[] }>(async () => {
      return this.post('/list-primitives', {});
    });
    return result.primitives ?? [];
  }

  /**
   * Get list of available operations
   */
  async listOperations(): Promise<string[]> {
    const result = await this.executeWithRetry<{ operations?: string[] }>(async () => {
      return this.post('/list-operations', {});
    });
    return result.operations ?? [];
  }

  /**
   * Execute with exponential backoff retry
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        
        // Don't retry on timeout (already took too long)
        if (lastError.message.includes('timeout')) {
          throw lastError;
        }
        
        if (attempt < this.maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms, ...
          const delay = Math.pow(2, attempt - 1) * 100;
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('max retries exceeded');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Make HTTP POST request
   */
  private post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const payload = JSON.stringify(body);

      const req = transport.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: this.timeout,
        },
        (res) => {
          let responseData = '';

          res.on('data', (chunk: Buffer) => {
            responseData += chunk.toString();
          });

          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                const result = JSON.parse(responseData) as T;
                resolve(result);
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
              }
            } catch (parseErr) {
              reject(new Error(`Failed to parse response: ${responseData}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`request timeout after ${this.timeout}ms`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(payload);
      req.end();
    });
  }
}
