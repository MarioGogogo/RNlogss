import type {LogEvent, LogLevel} from '../types';
import {EventType, EventSource, LogLevelName} from '../types';

export type OnLogCallback = (event: LogEvent) => void;

/** SDK 内部请求标记头，ApiCollector 检测到时跳过采集 */
export const RNLOGS_INTERNAL_HEADER = 'X-RNLogs-Internal';

let isPatched = false;

export class ApiCollector {
  private onLog: OnLogCallback;

  constructor(onLog: OnLogCallback) {
    this.onLog = onLog;
  }

  start(): void {
    if (isPatched) {
      return;
    }
    isPatched = true;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: unknown, init?: RequestInit) => {
      const startTime = Date.now();
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url ?? String(input);
      const method = init?.method ?? 'GET';

      // 跳过 SDK 自身的上传请求，避免无限循环
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers?.[RNLOGS_INTERNAL_HEADER]) {
        return originalFetch(input as RequestInfo, init);
      }

      try {
        const response = await originalFetch(input as RequestInfo, init);
        const durationMs = Date.now() - startTime;
        const statusCode = response.status;

        this.logApiEvent(url, method, {statusCode, durationMs}, durationMs);
        return response;
      } catch (error) {
        const durationMs = Date.now() - startTime;

        this.logApiEvent(
          url,
          method,
          {
            durationMs,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          durationMs,
          true,
        );
        throw error;
      }
    };
  }

  private logApiEvent(
    url: string,
    method: string,
    requestData: {
      statusCode?: number;
      durationMs: number;
      errorMessage?: string;
    },
    durationMs: number,
    isError = false,
  ): void {
    const level = isError ? 4 : 2;
    const event: LogEvent = {
      id: this.generateId(),
      type: EventType.API,
      source: EventSource.API,
      level: level as LogLevel,
      levelName: LogLevelName[level as LogLevel],
      message: `[API] ${method} ${url} — ${durationMs}ms`,
      timestamp: Date.now(),
      request: {
        url,
        method,
        statusCode: requestData.statusCode,
        durationMs: requestData.durationMs,
        errorMessage: requestData.errorMessage,
      },
    };
    this.onLog(event);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
