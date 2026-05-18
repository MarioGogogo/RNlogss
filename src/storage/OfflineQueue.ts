import type {LogEvent} from '../types';

/**
 * Phase 1-2: 纯内存离线队列
 * Phase 3 后可替换为 AsyncStorage 或 Native 文件持久化实现
 */
export class OfflineQueue {
  private queue: LogEvent[][] = [];

  async enqueue(events: LogEvent[]): Promise<void> {
    this.queue.push(events);
  }

  async dequeue(count: number): Promise<LogEvent[][]> {
    return this.queue.splice(0, count);
  }

  async peek(): Promise<LogEvent[][]> {
    return [...this.queue];
  }

  async clear(): Promise<void> {
    this.queue = [];
  }

  async size(): Promise<number> {
    return this.queue.length;
  }

  async restoreToHead(batch: LogEvent[]): Promise<void> {
    this.queue.unshift(batch);
  }
}
