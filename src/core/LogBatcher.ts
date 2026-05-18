import type {BatcherConfig, LogEvent} from '../types';
import {LogQueue} from './LogQueue';

export class LogBatcher {
  private queue: LogQueue;
  private maxBatchSize: number;
  private flushIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onFlush: (events: LogEvent[]) => void;

  constructor(
    onFlush: (events: LogEvent[]) => void,
    config: BatcherConfig = {},
  ) {
    this.onFlush = onFlush;
    this.maxBatchSize = config.maxBatchSize ?? 50;
    this.flushIntervalMs = config.flushIntervalMs ?? 5000;
    this.queue = new LogQueue(config.maxQueueSize ?? 1000);
    this.startTimer();
  }

  add(event: LogEvent): void {
    this.queue.enqueue(event);
    if (this.queue.size >= this.maxBatchSize) {
      this.flush();
    }
  }

  flush(): void {
    const batch = this.queue.dequeue(this.maxBatchSize);
    if (batch.length > 0) {
      this.onFlush(batch);
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}
