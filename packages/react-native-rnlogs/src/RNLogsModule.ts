import {
  type LogEvent,
  type LogLevel,
  type RNLogsConfig,
  type UserInfo,
  type AppInfo,
  EventType,
  EventSource,
  LogLevelName,
} from './types';
import {LogBatcher} from './core/LogBatcher';
import {NoOpNativeModule} from './native/NoOpNativeModule';
import {ExceptionCollector} from './collectors/ExceptionCollector';
import {ApiCollector} from './collectors/ApiCollector';
import {OperationCollector} from './collectors/OperationCollector';
import {PerformanceCollector} from './collectors/PerformanceCollector';
import {UploadQueue} from './uploader/UploadQueue';
import type {UploadConfig} from './uploader/UploadConfig';
import {NativeModules} from 'react-native';
import './specs/NativeRNLogs';

class RNLogsModule {
  private config: RNLogsConfig = {};
  private batcher: LogBatcher | null = null;
  private uploadQueue: UploadQueue | null = null;
  private user: UserInfo | null = null;
  private tags: Record<string, string> = {};
  private exceptionCollector: ExceptionCollector | null = null;
  private apiCollector: ApiCollector | null = null;
  private operationCollector: OperationCollector | null = null;
  private performanceCollector: PerformanceCollector | null = null;
  private initialized = false;
  private sessionId = '';
  private sdkVersion = '1.0.0';

  init(config: RNLogsConfig = {}): void {
    if (this.initialized) {
      console.warn('[RNLogs] already initialized');
      return;
    }

    this.config = {
      enabled: true,
      maxBatchSize: 50,
      flushIntervalMs: 5000,
      maxQueueSize: 1000,
      ...config,
    };

    this.tags = this.config.tags ?? {};
    this.sessionId = this.generateSessionId();

    // 触发 NativeModule 并同步安装 JSI 绑定
    if (NativeModules.RNLogsModule && typeof NativeModules.RNLogsModule.install === 'function') {
      try {
        const endpoint = this.config.upload?.endpoint ?? '';
        const success = NativeModules.RNLogsModule.install(endpoint, this.sessionId);
        console.log('[RNLogs] JSI installation result:', success);
      } catch (err) {
        console.error('[RNLogs] Failed to install JSI:', err);
      }
    }

    // Native init (no-op in Phase 1)
    NoOpNativeModule.init(this.config as Record<string, unknown>).catch(
      () => {
        /* no-op */
      },
    );

    // 上传队列
    const uploadConfig: UploadConfig = {
      endpoint: '',
      maxRetries: 3,
      retryDelayMs: 1000,
      batchSize: 50,
      ...this.config.upload,
    };
    this.uploadQueue = new UploadQueue(uploadConfig);
    this.syncBatchMeta();

    // 初始化 C++ 层配置
    if (global.__rnlogsInternal) {
      global.__rnlogsInternal.initialize(JSON.stringify(this.config));
    }

    // 批处理器：flush 时交给上传队列
    this.batcher = new LogBatcher(
      batch => {
        console.log('[RNLogs BATCH]', JSON.stringify(batch, null, 2));
        this.uploadQueue?.addBatch(batch);
        NoOpNativeModule.sendBatch(batch).catch(() => {
          /* no-op */
        });
      },
      this.config,
    );

    this.exceptionCollector = new ExceptionCollector(event =>
      this.handleEvent(event),
    );
    this.exceptionCollector.start();

    this.apiCollector = new ApiCollector(event => this.handleEvent(event));
    this.apiCollector.start();

    this.operationCollector = new OperationCollector(event =>
      this.handleEvent(event),
    );

    if (this.config.enablePerformanceCollector !== false) {
      this.performanceCollector = new PerformanceCollector(event =>
        this.handleEvent(event),
      );
      this.performanceCollector.start();
    }

    this.initialized = true;
    console.log('[RNLogs] initialized', this.config);
  }

  log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (!this.initialized) {
      console.warn('[RNLogs] not initialized');
      return;
    }

    const event: LogEvent = {
      id: this.generateId(),
      type: EventType.MANUAL,
      source: EventSource.MANUAL,
      level,
      levelName: LogLevelName[level],
      message,
      timestamp: Date.now(),
      data,
      user: this.user || undefined,
      tags: Object.keys(this.tags).length > 0 ? {...this.tags} : undefined,
      context: {
        environment: this.config.environment,
        release: this.config.release,
      },
    };

    this.handleEvent(event);
  }

  setUser(user: UserInfo | null): void {
    this.user = user;
    NoOpNativeModule.setUser(user).catch(() => {
      /* no-op */
    });
  }

  addBreadcrumb(
    message: string,
    category?: string,
    data?: Record<string, unknown>,
  ): void {
    this.operationCollector?.addBreadcrumb(message, category, data);
    if (global.__rnlogsInternal) {
      global.__rnlogsInternal.addBreadcrumb(message, category ?? 'default');
    }
  }

  trackAction(action: string, data?: Record<string, unknown>): void {
    this.operationCollector?.trackAction(action, data);
  }

  trackScreen(screenName: string, data?: Record<string, unknown>): void {
    this.operationCollector?.trackScreen(screenName, data);
  }

  flush(): void {
    this.batcher?.flush();
    this.uploadQueue?.flush();
    NoOpNativeModule.flush().catch(() => {
      /* no-op */
    });
    if (global.__rnlogsInternal) {
      global.__rnlogsInternal.flush();
    }
  }

  async getOfflineSize(): Promise<number> {
    return this.uploadQueue?.getOfflineSize() ?? 0;
  }

  destroy(): void {
    this.exceptionCollector?.stop();
    this.performanceCollector?.stop();
    this.batcher?.destroy();
    this.uploadQueue?.destroy();
    this.initialized = false;
  }

  /** 获取当前会话信息，供 Uploader 构建批次元数据 */
  getSessionId(): string {
    return this.sessionId;
  }

  getDevice(): RNLogsConfig['device'] {
    return this.config.device;
  }

  getAppInfo(): AppInfo {
    return {
      version: this.sdkVersion,
      environment: this.config.environment ?? 'unknown',
      release: this.config.release ?? 'unknown',
    };
  }

  getBreadcrumbs(): readonly import('./types').Breadcrumb[] {
    return this.operationCollector?.getBreadcrumbs() ?? [];
  }

  private handleEvent(event: LogEvent): void {
    if (!this.config.enabled) {
      return;
    }

    // 统一 enrich：确保所有事件都有上下文
    let enriched = this.enrichEvent(event);

    if (this.config.beforeSend) {
      const result = this.config.beforeSend(enriched);
      if (result === null) {
        return;
      }
      enriched = result;
    }

    this.batcher?.add(enriched);

    // Phase 2: 单条实时写入 C++
    if (global.__rnlogsInternal) {
      global.__rnlogsInternal.writeLog(JSON.stringify(enriched));
    }
  }

  /** 同步批次元数据到 UploadQueue/Uploader */
  private syncBatchMeta(): void {
    this.uploadQueue?.setBatchMeta({
      sessionId: this.sessionId,
      device: this.config.device,
      app: this.getAppInfo(),
      breadcrumbs: this.operationCollector?.getBreadcrumbs(),
    });
  }

  /** 统一 enrich：所有 collector 产生的事件都附加用户/标签/上下文 */
  private enrichEvent(event: LogEvent): LogEvent {
    if (!event.user && this.user) {
      event.user = this.user;
    }
    if (!event.tags && Object.keys(this.tags).length > 0) {
      event.tags = {...this.tags};
    }
    if (!event.context) {
      event.context = {
        environment: this.config.environment,
        release: this.config.release,
      };
    }
    return event;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private generateSessionId(): string {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export const RNLogs = new RNLogsModule();
