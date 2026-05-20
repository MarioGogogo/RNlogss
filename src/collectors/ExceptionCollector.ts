import type {LogEvent, LogLevel} from '../types';
import {EventType, EventSource, LogLevelName} from '../types';

export type OnLogCallback = (event: LogEvent) => void;

let originalHandler: ((error: Error, isFatal?: boolean) => void) | null = null;
let rnRejectionTrackingOptions: any = null;
try {
  // eslint-disable-next-line @react-native/no-deep-imports
  rnRejectionTrackingOptions = require('react-native/Libraries/promiseRejectionTrackingOptions').default;
} catch {
  // ignore
}

function getErrorUtils() {
  return (globalThis as any).ErrorUtils;
}

export class ExceptionCollector {
  private onLog: OnLogCallback;
  private rejectionHandler: ((event: any) => void) | null = null;
  private isEnabled: boolean = false;

  constructor(onLog: OnLogCallback) {
    this.onLog = onLog;
  }

  start(): void {
    this.isEnabled = true;
    this.setupSyncHandler();
    this.setupRejectionHandler();
  }

  stop(): void {
    this.isEnabled = false;
    const ErrorUtils = getErrorUtils();
    if (originalHandler && ErrorUtils) {
      ErrorUtils.setGlobalHandler(originalHandler);
      originalHandler = null;
    }
    if (this.rejectionHandler) {
      (globalThis as any).removeEventListener?.(
        'unhandledRejection',
        this.rejectionHandler,
      );
      this.rejectionHandler = null;
    }
  }

  private setupSyncHandler(): void {
    const ErrorUtils = getErrorUtils();
    if (!ErrorUtils) {
      console.warn('[RNLogs] ErrorUtils not available');
      return;
    }
    originalHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      if (this.isEnabled) {
        this.buildExceptionEvent(error, isFatal ?? false);
      }
      if (originalHandler) {
        originalHandler(error, isFatal);
      }
    });
  }

  private setupRejectionHandler(): void {
    const global = globalThis as any;

    const onUnhandled = (id: any, rejection: any) => {
      if (!this.isEnabled) {
        return;
      }
      const error = rejection instanceof Error
        ? rejection
        : new Error(
            rejection === undefined
              ? 'Undefined Promise Rejection'
              : typeof rejection === 'string'
              ? rejection
              : JSON.stringify(rejection),
          );
      this.buildExceptionEvent(error, false);

      // 同时也触发 React Native 原生的 onUnhandled 处理器，保留 YellowBox/LogBox 等开发调试体验
      if (
        rnRejectionTrackingOptions &&
        typeof rnRejectionTrackingOptions.onUnhandled === 'function'
      ) {
        rnRejectionTrackingOptions.onUnhandled(id, rejection);
      }
    };

    const onHandled = (id: any) => {
      if (!this.isEnabled) {
        return;
      }
      // 同时也触发 React Native 原生的 onHandled 处理器
      if (
        rnRejectionTrackingOptions &&
        typeof rnRejectionTrackingOptions.onHandled === 'function'
      ) {
        rnRejectionTrackingOptions.onHandled(id);
      }
    };

    // 1. 尝试 Hermes 引擎自带的 Promise 拒绝追踪器
    if (global.HermesInternal?.enablePromiseRejectionTracker) {
      global.HermesInternal.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled,
        onHandled,
      });
      return;
    }

    // 2. 尝试 React Native 默认 Promise 库 (promise/setimmediate/rejection-tracking)
    try {
      const rejectionTracking = require('promise/setimmediate/rejection-tracking');
      rejectionTracking.enable({
        allRejections: true,
        onUnhandled,
        onHandled,
      });
    } catch {
      // 3. 回退到标准的 window/global 事件监听器 (例如在 React Native Web 或其他 JS 环境中)
      if (typeof global.addEventListener === 'function') {
        this.rejectionHandler = (event: any) => {
          if (!this.isEnabled) {
            return;
          }
          const error = event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason));
          this.buildExceptionEvent(error, false);
        };
        global.addEventListener('unhandledRejection', this.rejectionHandler);
      }
    }
  }

  private buildExceptionEvent(error: Error, isFatal: boolean): void {
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
        isFatal,
      },
    };
    this.onLog(event);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
