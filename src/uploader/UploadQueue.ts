import type {LogEvent} from '../types';
import type {UploadConfig} from './UploadConfig';
import {Uploader} from './Uploader';
import {OfflineQueue} from '../storage/OfflineQueue';
import type {BatchMeta} from './Uploader';

export class UploadQueue {
  uploader: Uploader;
  private offlineQueue: OfflineQueue;
  private config: UploadConfig;
  private memoryQueue: LogEvent[] = [];
  private isUploading = false;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: UploadConfig) {
    this.config = config;
    this.uploader = new Uploader(config);
    this.offlineQueue = new OfflineQueue();
    this.startRetryTimer();
  }

  /** 注入批次元数据到 Uploader */
  setBatchMeta(meta: BatchMeta): void {
    this.uploader.setBatchMeta(meta);
  }

  addBatch(events: LogEvent[]): void {
    this.memoryQueue.push(...events);
    // 异步触发 flush，不阻塞收集器
    Promise.resolve().then(() => this.flush());
  }

  async flush(): Promise<void> {
    if (this.isUploading || this.memoryQueue.length === 0) {
      return;
    }

    this.isUploading = true;
    const batchSize = this.config.batchSize ?? 50;

    while (this.memoryQueue.length > 0) {
      const batch = this.memoryQueue.splice(0, batchSize);
      const result = await this.uploader.upload(batch);

      if (result === 'retry') {
        await this.offlineQueue.enqueue(batch);
        console.log(
          `[RNLogs] ${batch.length} events saved to offline queue`,
        );
        break;
      } else if (result === 'drop') {
        console.warn(`[RNLogs] ${batch.length} events dropped`);
      }
    }

    this.isUploading = false;
  }

  async retryOffline(): Promise<void> {
    if (this.isUploading) {
      return;
    }

    const size = await this.offlineQueue.size();
    if (size === 0) {
      return;
    }

    this.isUploading = true;

    while (true) {
      const batches = await this.offlineQueue.dequeue(1);
      if (batches.length === 0) {
        break;
      }

      const events = batches[0];
      const result = await this.uploader.upload(events);

      if (result === 'retry') {
        await this.offlineQueue.restoreToHead(events);
        break;
      } else if (result === 'drop') {
        console.warn(
          `[RNLogs] offline batch (${events.length} events) dropped`,
        );
      }
    }

    this.isUploading = false;
  }

  async getOfflineSize(): Promise<number> {
    return this.offlineQueue.size();
  }

  destroy(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private startRetryTimer(): void {
    // 每 30 秒尝试重传一次离线队列
    this.retryTimer = setInterval(() => {
      this.retryOffline();
    }, 30000);
  }
}
