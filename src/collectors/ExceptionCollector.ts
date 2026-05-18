import type {LogEvent, LogLevel} from '../types';
import {EventType, EventSource, LogLevelName} from '../types';

export type OnLogCallback = (event: LogEvent) => void;

let originalHandler: ((error: Error, isFatal?: boolean) => void) | null = null;

function getErrorUtils() {
  return (globalThis as any).ErrorUtils;
}

export class ExceptionCollector {
  private onLog: OnLogCallback;

  constructor(onLog: OnLogCallback) {
    this.onLog = onLog;
  }

  start(): void {
    const ErrorUtils = getErrorUtils();
    if (!ErrorUtils) {
      console.warn('[RNLogs] ErrorUtils not available');
      return;
    }
    originalHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      const level = isFatal ? 5 : 4;
      const event: LogEvent = {
        id: this.generateId(),
        type: EventType.EXCEPTION,
        source: EventSource.EXCEPTION,
        level: level as LogLevel,
        levelName: LogLevelName[level as LogLevel],
        message: error.message,
        timestamp: Date.now(),
        exception: {
          name: error.name,
          stack: error.stack ?? '',
          isFatal: isFatal ?? false,
        },
      };
      this.onLog(event);

      if (originalHandler) {
        originalHandler(error, isFatal);
      }
    });
  }

  stop(): void {
    const ErrorUtils = getErrorUtils();
    if (originalHandler && ErrorUtils) {
      ErrorUtils.setGlobalHandler(originalHandler);
      originalHandler = null;
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
