export enum LogLevel {
  VERBOSE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
}

export const LogLevelName: Record<LogLevel, string> = {
  [LogLevel.VERBOSE]: 'verbose',
  [LogLevel.DEBUG]: 'debug',
  [LogLevel.INFO]: 'info',
  [LogLevel.WARN]: 'warn',
  [LogLevel.ERROR]: 'error',
  [LogLevel.FATAL]: 'fatal',
};

export enum EventType {
  MANUAL = 'manual',
  API = 'api',
  EXCEPTION = 'exception',
  ACTION = 'action',
  NAVIGATION = 'navigation',
  PERFORMANCE = 'performance',
}

export enum EventSource {
  MANUAL = 'manual',
  API = 'api',
  EXCEPTION = 'exception',
  OPERATION = 'operation',
  PERFORMANCE = 'performance',
}

export interface UserInfo {
  id: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
}

export interface Breadcrumb {
  message: string;
  category?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface ExceptionData {
  name: string;
  stack: string;
  isFatal: boolean;
}

export interface RequestData {
  url: string;
  method: string;
  statusCode?: number;
  durationMs: number;
  requestId?: string;
  errorMessage?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

export interface ActionData {
  name: string;
  screen?: string;
}

export interface LogEvent {
  id: string;
  type: EventType;
  source: EventSource;
  level: LogLevel;
  levelName: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;

  // 类型专有结构化字段
  exception?: ExceptionData;
  request?: RequestData;
  action?: ActionData;
  performance?: PerformanceMetrics;

  // 上下文信息
  user?: UserInfo;
  tags?: Record<string, string>;
  context?: Record<string, unknown>;
}

export interface DeviceInfo {
  deviceId: string;
  platform: string;
  osVersion: string;
  brand?: string;
  model?: string;
  screenWidth?: number;
  screenHeight?: number;
}

export interface AppInfo {
  version: string;
  buildNumber?: string;
  environment: string;
  release: string;
}

export interface BatchPayload {
  sdk: string;
  sdkVersion: string;
  batchId: string;
  sessionId: string;
  timestamp: number;
  batchSize: number;
  device?: DeviceInfo;
  app?: AppInfo;
  breadcrumbs?: readonly Breadcrumb[];
  events: LogEvent[];
}

export interface BatcherConfig {
  maxBatchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
}

import type {UploadConfig} from './uploader/UploadConfig';

export interface RNLogsConfig extends BatcherConfig {
  enabled?: boolean;
  environment?: string;
  release?: string;
  tags?: Record<string, string>;
  beforeSend?: (event: LogEvent) => LogEvent | null;
  upload?: UploadConfig;
  enablePerformanceCollector?: boolean;
  device?: DeviceInfo;
}

export interface NativeModule {
  init(config: Record<string, unknown>): Promise<void>;
  sendBatch(events: LogEvent[]): Promise<void>;
  setUser(user: UserInfo | null): Promise<void>;
  flush(): Promise<void>;
}

export interface ApiLogData {
  url: string;
  method: string;
  statusCode?: number;
  durationMs: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  errorMessage?: string;
}

export interface PerformanceMetrics {
  fps?: number;
  memory?: {
    used: number;
    total: number;
  };
  jsHeapSize?: number;
}
