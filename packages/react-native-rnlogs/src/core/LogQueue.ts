import type {LogEvent} from '../types';

export class LogQueue {
  private queue: LogEvent[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  enqueue(event: LogEvent): void {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift();
    }
    this.queue.push(event);
  }

  dequeue(count: number): LogEvent[] {
    return this.queue.splice(0, count);
  }

  get size(): number {
    return this.queue.length;
  }

  get all(): readonly LogEvent[] {
    return this.queue;
  }

  clear(): void {
    this.queue = [];
  }
}
