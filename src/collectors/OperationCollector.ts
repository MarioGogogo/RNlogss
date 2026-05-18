import type {Breadcrumb, LogEvent, LogLevel} from '../types';
import {EventType, EventSource, LogLevelName} from '../types';

export type OnLogCallback = (event: LogEvent) => void;

export class OperationCollector {
  private onLog: OnLogCallback;
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs = 100;

  constructor(onLog: OnLogCallback) {
    this.onLog = onLog;
  }

  trackAction(action: string, data?: Record<string, unknown>): void {
    const event: LogEvent = {
      id: this.generateId(),
      type: EventType.ACTION,
      source: EventSource.OPERATION,
      level: 2 as LogLevel,
      levelName: LogLevelName[2],
      message: `[Action] ${action}`,
      timestamp: Date.now(),
      data,
      action: {
        name: action,
      },
    };
    this.onLog(event);
    this.addBreadcrumb(action, 'action', data);
  }

  trackScreen(screenName: string, data?: Record<string, unknown>): void {
    const event: LogEvent = {
      id: this.generateId(),
      type: EventType.NAVIGATION,
      source: EventSource.OPERATION,
      level: 2 as LogLevel,
      levelName: LogLevelName[2],
      message: `[Screen] ${screenName}`,
      timestamp: Date.now(),
      data,
      action: {
        name: screenName,
        screen: screenName,
      },
    };
    this.onLog(event);
    this.addBreadcrumb(`Screen: ${screenName}`, 'navigation', data);
  }

  addBreadcrumb(
    message: string,
    category?: string,
    data?: Record<string, unknown>,
  ): void {
    if (this.breadcrumbs.length >= this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
    this.breadcrumbs.push({
      message,
      category,
      timestamp: Date.now(),
      data,
    });
  }

  getBreadcrumbs(): readonly Breadcrumb[] {
    return this.breadcrumbs;
  }

  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
