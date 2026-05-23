import type {AppInfo, BatchPayload, DeviceInfo, LogEvent} from '../types';
import type {UploadConfig} from './UploadConfig';
import {RNLOGS_INTERNAL_HEADER} from '../collectors/ApiCollector';

export type UploadResult = 'success' | 'retry' | 'drop';

export interface BatchMeta {
  sessionId: string;
  device?: DeviceInfo;
  app?: AppInfo;
  breadcrumbs?: readonly import('../types').Breadcrumb[];
}

export class Uploader {
  private config: UploadConfig;
  private batchMeta: BatchMeta = {sessionId: ''};

  constructor(config: UploadConfig) {
    this.config = config;
  }

  /** 由 RNLogsModule 注入批次元数据 */
  setBatchMeta(meta: BatchMeta): void {
    this.batchMeta = meta;
  }

  async upload(events: LogEvent[]): Promise<UploadResult> {
    if (!this.config.endpoint) {
      console.warn('[RNLogs] upload endpoint not configured');
      return 'retry';
    }

    const payload = this.buildPayload(events);
    console.log('[RNLogs] sending payload:', JSON.stringify(payload, null, 2));
    const maxRetries = this.config.maxRetries ?? 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [RNLOGS_INTERNAL_HEADER]: 'true',
            ...(this.config.apiKey
              ? {'X-Api-Key': this.config.apiKey}
              : {}),
            ...this.config.headers,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          console.log(
            `[RNLogs] uploaded ${events.length} events`,
          );
          return 'success';
        }

        // 4xx 客户端错误，不 retry
        if (res.status >= 400 && res.status < 500) {
          console.error(`[RNLogs] upload rejected: ${res.status}`);
          return 'drop';
        }

        // 5xx 服务端错误，retry
        await this.delay(this.getRetryDelay(attempt));
      } catch (err) {
        console.warn(
          `[RNLogs] upload attempt ${attempt + 1}/${maxRetries} failed`,
          err instanceof Error ? err.message : String(err),
        );
        await this.delay(this.getRetryDelay(attempt));
      }
    }

    return 'retry';
  }

  private buildPayload(events: LogEvent[]): BatchPayload {
    const meta = this.batchMeta;
    return {
      sdk: 'rnlogs',
      sdkVersion: '1.0.0',
      batchId: this.generateId(),
      sessionId: meta.sessionId,
      timestamp: Date.now(),
      batchSize: events.length,
      device: meta.device,
      app: meta.app,
      breadcrumbs: meta.breadcrumbs && meta.breadcrumbs.length > 0
        ? meta.breadcrumbs
        : undefined,
      events,
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private getRetryDelay(attempt: number): number {
    const base = this.config.retryDelayMs ?? 1000;
    return base * Math.pow(2, attempt);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
