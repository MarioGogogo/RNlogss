import {AppState, type AppStateStatus} from 'react-native';
import type {LogEvent, LogLevel, PerformanceMetrics} from '../types';
import {EventType, EventSource, LogLevelName} from '../types';

export type OnLogCallback = (event: LogEvent) => void;

export class PerformanceCollector {
  private onLog: OnLogCallback;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sampleIntervalMs = 5000;

  constructor(onLog: OnLogCallback) {
    this.onLog = onLog;
  }

  start(): void {
    this.timer = setInterval(() => {
      this.collectMetrics();
    }, this.sampleIntervalMs);

    // 应用进入前台时立即采集一次
    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          this.collectMetrics();
        }
      },
    );

    // 将 subscription 挂载到实例上以便清理
    (this as unknown as Record<string, unknown>).appStateSubscription =
      subscription;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const subscription = (this as unknown as Record<string, unknown>)
      .appStateSubscription;
    if (subscription && typeof (subscription as {remove: () => void}).remove === 'function') {
      (subscription as {remove: () => void}).remove();
    }
  }

  private collectMetrics(): void {
    const metrics: PerformanceMetrics = {};

    // 内存信息
    const perf = (globalThis as any).performance;
    if (perf && 'memory' in perf) {
      const memory = (perf.memory as {usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number} | undefined);
      if (memory) {
        metrics.jsHeapSize = Math.round(memory.usedJSHeapSize / 1024 / 1024);
        metrics.memory = {
          used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
        };
      }
    }

    const event: LogEvent = {
      id: this.generateId(),
      type: EventType.PERFORMANCE,
      source: EventSource.PERFORMANCE,
      level: 1 as LogLevel,
      levelName: LogLevelName[1],
      message: '[Performance] metrics sample',
      timestamp: Date.now(),
      performance: metrics,
    };
    this.onLog(event);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
