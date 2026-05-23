# react-native-rnlogs API 文档

> 高性能智能日志采集与上报系统

**版本：** 1.0.0

---

## 目录

- [快速开始](#快速开始)
- [初始化配置](#初始化配置)
  - [RNLogsConfig](#rnlogsconfig)
  - [BatcherConfig](#batcherconfig)
  - [UploadConfig](#uploadconfig)
- [核心 API](#核心-api)
  - [init()](#init)
  - [log()](#log)
  - [setUser()](#setuser)
  - [addBreadcrumb()](#addbreadcrumb)
  - [trackAction()](#trackaction)
  - [trackScreen()](#trackscreen)
  - [flush()](#flush)
  - [getOfflineSize()](#getofflinesize)
  - [destroy()](#destroy)
  - [getSessionId()](#getsessionid)
  - [getDevice()](#getdevice)
  - [getAppInfo()](#getappinfo)
  - [getBreadcrumbs()](#getbreadcrumbs)
- [类型定义](#类型定义)
  - [枚举](#枚举)
  - [接口](#接口)
- [自动采集器](#自动采集器)
- [架构概览](#架构概览)
- [JSI 原生绑定](#jsi-原生绑定)
- [平台特定说明](#平台特定说明)
- [高级用法](#高级用法)

---

## 快速开始

### 安装

```bash
npm install react-native-rnlogs
# 或
yarn add react-native-rnlogs
```

### 基础使用

```typescript
import { RNLogs, LogLevel } from 'react-native-rnlogs';

// 初始化 SDK
RNLogs.init({
  environment: 'production',
  release: '1.0.0',
  upload: {
    endpoint: 'https://your-log-server.com/api/logs',
    apiKey: 'your-api-key',
  },
});

// 记录日志
RNLogs.log(LogLevel.INFO, '应用已启动');

// 设置用户信息
RNLogs.setUser({
  id: 'user-123',
  name: '张三',
  email: 'zhangsan@example.com',
});
```

---

## 初始化配置

### RNLogsConfig

SDK 的完整配置项，继承自 `BatcherConfig`。

```typescript
interface RNLogsConfig extends BatcherConfig {
  enabled?: boolean;                    // 是否启用 SDK，默认 true
  environment?: string;                 // 环境标识，如 'production'、'staging'
  release?: string;                     // 应用版本号
  tags?: Record<string, string>;        // 全局标签，合并到每个事件中
  beforeSend?: (event: LogEvent) => LogEvent | null;  // 事件拦截器
  upload?: UploadConfig;                // 上传配置
  enablePerformanceCollector?: boolean; // 是否启用性能采集，默认 true
  device?: DeviceInfo;                  // 设备元数据
}
```

#### 配置示例

```typescript
RNLogs.init({
  // 基础配置
  enabled: true,
  environment: 'production',
  release: '2.1.0',

  // 批处理配置
  maxBatchSize: 100,
  flushIntervalMs: 3000,
  maxQueueSize: 2000,

  // 上传配置
  upload: {
    endpoint: 'https://logs.example.com/api/v1/batch',
    apiKey: 'sk-xxxxx',
    maxRetries: 5,
    retryDelayMs: 2000,
    compress: true,
  },

  // 全局标签
  tags: {
    team: 'mobile',
    feature: 'payment',
  },

  // 事件拦截器
  beforeSend: (event) => {
    // 过滤敏感信息
    if (event.message?.includes('password')) {
      return null; // 返回 null 丢弃该事件
    }
    // 修改事件
    event.tags = { ...event.tags, processed: 'true' };
    return event;
  },

  // 性能采集
  enablePerformanceCollector: true,

  // 设备信息
  device: {
    deviceId: 'unique-device-id',
    platform: 'ios',
    osVersion: '17.0',
    brand: 'Apple',
    model: 'iPhone 15 Pro',
  },
});
```

### BatcherConfig

批处理器配置，控制日志事件的缓冲与批量发送策略。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxBatchSize` | `number` | `50` | 每批次最大事件数量 |
| `flushIntervalMs` | `number` | `5000` | 定时刷新间隔（毫秒） |
| `maxQueueSize` | `number` | `1000` | 内存队列最大容量，超出时淘汰最旧事件 |

### UploadConfig

上传服务配置。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `endpoint` | `string` | **必填** | 日志服务端接收地址 |
| `apiKey` | `string` | - | API 密钥，通过 `Authorization` header 发送 |
| `maxRetries` | `number` | `3` | 最大重试次数 |
| `retryDelayMs` | `number` | `1000` | 重试基础延迟（毫秒），采用指数退避 |
| `batchSize` | `number` | `50` | 单次上传批次大小 |
| `compress` | `boolean` | `false` | 是否启用 gzip 压缩 |
| `headers` | `Record<string, string>` | - | 自定义 HTTP 请求头 |

---

## 核心 API

所有 API 通过 `RNLogs` 单例对象访问。

### init()

初始化 SDK。幂等操作，重复调用会在控制台输出警告。

```typescript
RNLogs.init(config?: RNLogsConfig): void
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `config` | `RNLogsConfig` | 否 | SDK 配置项，所有字段可选 |

**初始化流程：**

1. 合并配置与默认值
2. 生成会话 ID（格式：`sess-{timestamp}-{random}`）
3. 尝试同步安装 JSI 绑定（C++ 层）
4. 初始化原生模块
5. 创建上传队列和离线存储
6. 同步批处理元数据（会话、设备、应用信息）
7. 创建日志批处理器
8. 启动异常采集器
9. 启动 API 请求采集器
10. 启动操作采集器
11. 条件性启动性能采集器

**示例：**

```typescript
// 最简初始化
RNLogs.init();

// 完整配置初始化
RNLogs.init({
  environment: __DEV__ ? 'development' : 'production',
  release: DeviceInfo.getVersion(),
  upload: {
    endpoint: 'https://logs.example.com/api/v1/batch',
    apiKey: 'your-api-key',
  },
  maxBatchSize: 100,
  flushIntervalMs: 5000,
});
```

---

### log()

手动记录一条日志事件。

```typescript
RNLogs.log(level: LogLevel, message: string, data?: Record<string, unknown>): void
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `level` | `LogLevel` | 是 | 日志级别 |
| `message` | `string` | 是 | 日志消息内容 |
| `data` | `Record<string, unknown>` | 否 | 结构化附加数据 |

**示例：**

```typescript
import { RNLogs, LogLevel } from 'react-native-rnlogs';

// 基础日志
RNLogs.log(LogLevel.DEBUG, '调试信息');

// 带结构化数据
RNLogs.log(LogLevel.INFO, '用户登录成功', {
  userId: 'user-123',
  loginMethod: 'wechat',
  ip: '192.168.1.1',
});

// 错误日志
RNLogs.log(LogLevel.ERROR, '支付失败', {
  orderId: 'ORD-20240101-001',
  errorCode: 'PAYMENT_TIMEOUT',
  amount: 99.9,
});

// 致命错误
RNLogs.log(LogLevel.FATAL, '数据库崩溃', {
  dbPath: '/data/app.db',
  errorCode: 'SQLITE_CORRUPT',
});
```

---

### setUser()

设置当前用户信息，关联到所有后续事件。传入 `null` 可清除用户信息。

```typescript
RNLogs.setUser(user: UserInfo | null): void
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user` | `UserInfo \| null` | 是 | 用户信息对象或 null |

**UserInfo 结构：**

```typescript
interface UserInfo {
  id: string;                          // 用户唯一标识（必填）
  name?: string;                       // 用户名
  email?: string;                      // 邮箱
  [key: string]: unknown;              // 自定义扩展字段
}
```

**示例：**

```typescript
// 设置用户
RNLogs.setUser({
  id: 'user-123',
  name: '张三',
  email: 'zhangsan@example.com',
  role: 'premium',
  vipLevel: 3,
});

// 登出时清除
RNLogs.setUser(null);
```

---

### addBreadcrumb()

记录面包屑（导航轨迹），用于崩溃发生时还原用户操作路径。面包屑同时同步到 C++ 层，崩溃时可信号安全地写入磁盘。

```typescript
RNLogs.addBreadcrumb(
  message: string,
  category?: string,
  data?: Record<string, unknown>
): void
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | 是 | 面包屑消息 |
| `category` | `string` | 否 | 分类（如 `ui`、`navigation`、`api`） |
| `data` | `Record<string, unknown>` | 否 | 附加数据 |

**示例：**

```typescript
// 记录用户操作轨迹
RNLogs.addBreadcrumb('点击购买按钮', 'ui', { productId: 'P001' });
RNLogs.addBreadcrumb('进入支付页面', 'navigation', { screen: 'Payment' });
RNLogs.addBreadcrumb('发起支付请求', 'api', { orderId: 'ORD-001' });
```

> **注意：** 内存中最多保留 100 条面包屑，超出后自动淘汰最旧的。C++ 层的 BreadcrumbTracker 使用无锁环形缓冲区，容量为 30 条。

---

### trackAction()

追踪用户行为事件。

```typescript
RNLogs.trackAction(action: string, data?: Record<string, unknown>): void
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | `string` | 是 | 行为名称 |
| `data` | `Record<string, unknown>` | 否 | 附加数据 |

**示例：**

```typescript
RNLogs.trackAction('add_to_cart', {
  productId: 'P001',
  productName: 'iPhone 15',
  price: 5999,
  quantity: 1,
});

RNLogs.trackAction('share_content', {
  type: 'image',
  target: 'wechat',
});
```

---

### trackScreen()

追踪页面导航事件。

```typescript
RNLogs.trackScreen(screenName: string, data?: Record<string, unknown>): void
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `screenName` | `string` | 是 | 页面名称 |
| `data` | `Record<string, unknown>` | 否 | 附加数据 |

**示例：**

```typescript
// React Navigation 集成示例
navigationRef.listen('state', (state) => {
  const currentRoute = navigationRef.getCurrentRoute();
  if (currentRoute) {
    RNLogs.trackScreen(currentRoute.name, {
      params: currentRoute.params,
    });
  }
});

// 手动追踪
RNLogs.trackScreen('HomeScreen');
RNLogs.trackScreen('ProductDetail', { productId: 'P001' });
```

---

### flush()

强制立即刷新所有缓冲区。将内存中的日志批次发送到上传队列、同步写入 C++ 队列，并尝试上传。

```typescript
RNLogs.flush(): void
```

**示例：**

```typescript
// 在关键操作前确保日志已上报
RNLogs.flush();

// 应用进入后台时刷新
AppState.addEventListener('change', (state) => {
  if (state === 'background') {
    RNLogs.flush();
  }
});
```

---

### getOfflineSize()

获取离线队列中待重传的批次数。

```typescript
RNLogs.getOfflineSize(): Promise<number>
```

**返回值：** `Promise<number>` — 离线队列中的批次数量。

**示例：**

```typescript
const size = await RNLogs.getOfflineSize();
console.log(`离线队列中有 ${size} 个批次等待上传`);
```

---

### destroy()

销毁 SDK 实例，停止所有采集器，清理资源。SDK 将变为未初始化状态。

```typescript
RNLogs.destroy(): void
```

**示例：**

```typescript
// 用户注销时清理
RNLogs.destroy();

// 需要重新 init() 才能继续使用
RNLogs.init(newConfig);
```

---

### getSessionId()

获取当前会话 ID。

```typescript
RNLogs.getSessionId(): string
```

**返回值：** `string` — 会话标识，格式为 `sess-{timestamp}-{random}`。

**示例：**

```typescript
const sessionId = RNLogs.getSessionId();
console.log('当前会话:', sessionId);
// 输出: 当前会话: sess-1700000000000-a1b2c3d4
```

---

### getDevice()

获取 SDK 配置中的设备信息。

```typescript
RNLogs.getDevice(): DeviceInfo | undefined
```

**返回值：** `DeviceInfo | undefined`

---

### getAppInfo()

获取 SDK 应用信息。

```typescript
RNLogs.getAppInfo(): AppInfo
```

**返回值：** `AppInfo` — 包含 SDK 版本、环境和发布版本。

```typescript
interface AppInfo {
  version: string;       // SDK 版本号
  buildNumber?: string;  // 构建号
  environment: string;   // 运行环境
  release: string;       // 应用发布版本
}
```

---

### getBreadcrumbs()

获取当前面包屑轨迹的只读副本。

```typescript
RNLogs.getBreadcrumbs(): readonly Breadcrumb[]
```

**返回值：** `readonly Breadcrumb[]`

---

## 类型定义

### 枚举

#### LogLevel

日志级别枚举。

```typescript
enum LogLevel {
  VERBOSE = 0,  // 详细
  DEBUG   = 1,  // 调试
  INFO    = 2,  // 信息
  WARN    = 3,  // 警告
  ERROR   = 4,  // 错误
  FATAL   = 5,  // 致命
}
```

#### EventType

事件类型枚举。

```typescript
enum EventType {
  MANUAL,       // 手动日志
  API,          // API 请求
  EXCEPTION,    // 异常
  ACTION,       // 用户行为
  NAVIGATION,   // 页面导航
  PERFORMANCE,  // 性能指标
}
```

#### EventSource

事件来源枚举。

```typescript
enum EventSource {
  MANUAL,       // 手动
  API,          // API
  EXCEPTION,    // 异常
  OPERATION,    // 操作
  PERFORMANCE,  // 性能
}
```

#### LogLevelName

日志级别名称映射。

```typescript
const LogLevelName: Record<LogLevel, string>;
// { 0: 'VERBOSE', 1: 'DEBUG', 2: 'INFO', 3: 'WARN', 4: 'ERROR', 5: 'FATAL' }
```

---

### 接口

#### LogEvent

核心日志事件结构，所有采集器产生的事件都遵循此格式。

```typescript
interface LogEvent {
  id: string;                            // 事件唯一标识
  type: EventType;                       // 事件类型
  source: EventSource;                   // 事件来源
  level: LogLevel;                       // 日志级别
  levelName: string;                     // 级别名称
  message: string;                       // 事件消息
  timestamp: number;                     // 时间戳（毫秒）
  data?: Record<string, unknown>;        // 结构化附加数据
  exception?: ExceptionData;             // 异常信息（仅异常事件）
  request?: RequestData;                 // 请求信息（仅 API 事件）
  action?: ActionData;                   // 行为信息（仅行为事件）
  performance?: PerformanceMetrics;      // 性能指标（仅性能事件）
  user?: UserInfo;                       // 关联用户信息
  tags?: Record<string, string>;         // 事件标签
  context?: Record<string, unknown>;     // 上下文信息
}
```

#### ExceptionData

```typescript
interface ExceptionData {
  name: string;      // 异常名称（如 TypeError、ReferenceError）
  stack: string;     // 堆栈追踪
  isFatal: boolean;  // 是否为致命异常
}
```

#### RequestData

```typescript
interface RequestData {
  url: string;                           // 请求 URL
  method: string;                        // HTTP 方法
  statusCode?: number;                   // 响应状态码
  durationMs: number;                    // 请求耗时（毫秒）
  requestId?: string;                    // 请求唯一标识
  errorMessage?: string;                 // 错误消息
  requestHeaders?: Record<string, string>;  // 请求头
  responseHeaders?: Record<string, string>; // 响应头
}
```

#### ActionData

```typescript
interface ActionData {
  name: string;       // 行为名称
  screen?: string;    // 所在页面
}
```

#### PerformanceMetrics

```typescript
interface PerformanceMetrics {
  fps?: number;                           // 帧率
  memory?: { used: number; total: number }; // 内存使用
  jsHeapSize?: number;                    // JS 堆大小
}
```

#### DeviceInfo

```typescript
interface DeviceInfo {
  deviceId: string;         // 设备唯一标识
  platform: string;         // 平台（ios / android）
  osVersion: string;        // 操作系统版本
  brand?: string;           // 设备品牌
  model?: string;           // 设备型号
  screenWidth?: number;     // 屏幕宽度
  screenHeight?: number;    // 屏幕高度
}
```

#### AppInfo

```typescript
interface AppInfo {
  version: string;          // SDK 版本
  buildNumber?: string;     // 构建号
  environment: string;      // 运行环境
  release: string;          // 应用发布版本
}
```

#### BatchPayload

上传到服务端的载荷格式。

```typescript
interface BatchPayload {
  sdk: string;                           // SDK 名称
  sdkVersion: string;                    // SDK 版本
  batchId: string;                       // 批次唯一标识
  sessionId: string;                     // 会话 ID
  timestamp: number;                     // 批次时间戳
  batchSize: number;                     // 事件数量
  device?: DeviceInfo;                   // 设备信息
  app?: AppInfo;                         // 应用信息
  breadcrumbs?: readonly Breadcrumb[];   // 面包屑轨迹
  events: LogEvent[];                    // 事件列表
}
```

#### Breadcrumb

```typescript
interface Breadcrumb {
  message: string;                        // 面包屑消息
  category?: string;                      // 分类
  timestamp: number;                      // 时间戳
  data?: Record<string, unknown>;         // 附加数据
}
```

---

## 自动采集器

SDK 内置 4 个自动采集器，在 `init()` 后自动启动。

### ExceptionCollector（异常采集器）

自动捕获 JavaScript 异常和未处理的 Promise 拒绝。

**捕获源：**
- `ErrorUtils.setGlobalHandler` — JS 全局异常
- Hermes 原生 Promise rejection tracker
- React Native `promise/setimmediate/rejection-tracking`
- `unhandledRejection` 事件监听（兜底）

**产生的事件：**
- `type`: `EventType.EXCEPTION`
- `source`: `EventSource.EXCEPTION`
- `level`: `LogLevel.ERROR`（非致命）或 `LogLevel.FATAL`（致命）
- `exception`: 包含异常名称、堆栈、是否致命

**示例输出：**
```json
{
  "type": "EXCEPTION",
  "level": 4,
  "message": "TypeError: Cannot read property 'name' of undefined",
  "exception": {
    "name": "TypeError",
    "stack": "at UserCard (UserCard.tsx:42:15)...",
    "isFatal": true
  }
}
```

### ApiCollector（API 采集器）

自动拦截和记录所有 `fetch` 请求。通过 Monkey-patching `globalThis.fetch` 实现。

**过滤规则：**
- 自动跳过 SDK 内部请求（通过 `X-RNLogs-Internal` header 识别）
- 自动跳过 `localhost` 请求

**产生的事件：**
- `type`: `EventType.API`
- `source`: `EventSource.API`
- `level`: 根据状态码自动判定（2xx → INFO，4xx → WARN，5xx → ERROR）
- `request`: 包含 URL、方法、状态码、耗时等

**示例输出：**
```json
{
  "type": "API",
  "level": 2,
  "message": "GET /api/users/123 - 200",
  "request": {
    "url": "https://api.example.com/users/123",
    "method": "GET",
    "statusCode": 200,
    "durationMs": 234
  }
}
```

### OperationCollector（操作采集器）

管理用户行为追踪、页面导航和面包屑记录。维护最多 100 条面包屑的环形缓冲区。

**产生的事件：**
- `trackAction()` → `EventType.ACTION`
- `trackScreen()` → `EventType.NAVIGATION`
- `addBreadcrumb()` → 面包屑记录（非独立事件，附加到其他事件中）

### PerformanceCollector（性能采集器）

定期采样 JavaScript 运行时性能指标。

**采集策略：**
- 每 5 秒定时采样
- 应用从后台恢复到前台时立即采样

**采集指标：**
- `jsHeapSize` — JS 堆内存大小（通过 `performance.memory`）

**可通过配置禁用：**
```typescript
RNLogs.init({
  enablePerformanceCollector: false,
});
```

---

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                   TypeScript SDK                     │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Exception   │  │     API      │  │ Operation  │ │
│  │  Collector   │  │  Collector   │  │ Collector  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │         │
│         └────────┬────────┘────────────────┘         │
│                  ▼                                    │
│         ┌──────────────┐    ┌──────────────┐         │
│         │  LogBatcher  │───▶│ UploadQueue  │         │
│         │ (时间+大小)   │    │ + OfflineQ   │         │
│         └──────┬───────┘    └──────┬───────┘         │
│                │                   │                  │
└────────────────┼───────────────────┼──────────────────┘
                 │                   │
         ┌───────▼───────┐   ┌──────▼──────┐
         │   JSI/C++     │   │   Uploader  │
         │  __rnlogs     │   │ HTTP POST   │
         │  Internal     │   │ + 重试机制   │
         └───────┬───────┘   └─────────────┘
                 │
    ┌────────────▼────────────────┐
         │       C++ Core           │
         │  ┌────────────────┐     │
         │  │  LogQueue      │     │
         │  │  (Arena Alloc) │     │
         │  └───────┬────────┘     │
         │  ┌───────▼────────┐     │
         │  │ gzip + AES-256 │     │
         │  │ 加密后写入磁盘  │     │
         │  └────────────────┘     │
         │  ┌────────────────┐     │
         │  │ Breadcrumb     │     │
         │  │ Tracker (30条) │     │
         │  └────────────────┘     │
         │  ┌────────────────┐     │
         │  │ CrashReporter  │     │
         │  │ (信号安全写入)  │     │
         │  └────────────────┘     │
         └─────────────────────────┘
```

### 数据流

```
采集器 → handleEvent() → enrichEvent() → beforeSend() → LogBatcher.add()
  → (大小或时间触发) → LogBatcher.onFlush 回调
    → UploadQueue.addBatch() → Uploader.upload() (HTTP POST + 重试)
    → __rnlogsInternal.writeLog() (同步写入 C++ 队列)
      → C++ LogQueue.push() → (达到批次大小) → gzip + AES 加密 → 磁盘 .dat 文件
        → Android 原生轮询 → fetchNextBatch() → HTTP/gRPC 上传 → confirmBatch()
```

---

## JSI 原生绑定

SDK 通过 JSI（JavaScript Interface）实现 JavaScript 与 C++ 的高性能同步通信。

### 全局对象 `__rnlogsInternal`

JSI 安装成功后，JavaScript 全局作用域将注入 `__rnlogsInternal` 对象。

> **注意：** 该对象为内部接口，不建议直接使用。所有操作应通过 `RNLogs` 单例的公开 API 完成。

| 方法 | 签名 | 说明 |
|------|------|------|
| `initialize` | `(configJson: string) => void` | 初始化 C++ 层配置 |
| `writeLog` | `(logData: string) => void` | 写入单条日志 |
| `writeLogBatch` | `(batchJson: string) => void` | 批量写入日志 |
| `getQueueSize` | `() => number` | 获取 C++ 队列大小 |
| `flush` | `() => void` | 刷新 C++ 队列到磁盘 |
| `clear` | `() => void` | 清空 C++ 队列 |
| `addBreadcrumb` | `(message: string, category: string) => void` | 添加面包屑到 C++ 层 |
| `hasPendingCrashReport` | `() => boolean` | 检查是否有待处理的崩溃报告 |
| `consumeCrashReport` | `() => string` | 消费崩溃报告（JSON 字符串） |
| `triggerNativeCrash` | `() => void` | 触发原生崩溃（仅调试用） |

### 检测 JSI 可用性

```typescript
import { isJsiAvailable } from 'react-native-rnlogs';

if (isJsiAvailable()) {
  console.log('JSI 绑定已就绪');
}
```

---

## 平台特定说明

### Android

- **原生崩溃捕获：** 通过 `sigaction` 注册信号处理器，捕获 SIGSEGV、SIGABRT、SIGFPE、SIGILL、SIGBUS
- **原生轮询上报：** 5 秒轮询 C++ 队列，支持 JSON 和 gRPC（protobuf）两种上传模式
- **构建依赖：** CMake + NDK，编译 C++ 代码为 `libreact-native-rnlogs.so`
- **崩溃报告：** 信号安全写入，崩溃后重新启动时通过 `hasPendingCrashReport()` / `consumeCrashReport()` 获取

### iOS

- **原生崩溃捕获：** 集成 PLCrashReporter（CocoaPods 依赖 `~> 1.11.0`）
- **JSI 安装：** 通过 `RCTBridgeModule` 同步方法安装
- **崩溃报告：** 崩溃后下次启动时消费报告，自动合并 C++ 层面包屑数据

---

## 高级用法

### 事件过滤与修改

使用 `beforeSend` 拦截器可以过滤敏感信息或修改事件数据。

```typescript
RNLogs.init({
  beforeSend: (event) => {
    // 1. 丢弃包含敏感关键词的事件
    if (event.message?.includes('[SECURE]')) {
      return null;
    }

    // 2. 过滤请求中的敏感头信息
    if (event.request?.requestHeaders) {
      const { authorization, cookie, ...safeHeaders } = event.request.requestHeaders;
      event.request.requestHeaders = safeHeaders;
    }

    // 3. 添加全局上下文
    event.context = {
      ...event.context,
      appState: AppState.currentState,
      networkType: NetInfo.type,
    };

    return event;
  },
});
```

### React Navigation 集成

```typescript
import { NavigationContainer } from '@react-navigation/native';
import { RNLogs } from 'react-native-rnlogs';

const navigationRef = createNavigationContainerRef();

function App() {
  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        RNLogs.trackScreen(navigationRef.getCurrentRoute()?.name ?? 'Unknown');
      }}
      onStateChange={() => {
        const route = navigationRef.getCurrentRoute();
        if (route) {
          RNLogs.trackScreen(route.name, { params: route.params });
        }
      }}
    >
      {/* ... */}
    </NavigationContainer>
  );
}
```

### 应用生命周期集成

```typescript
import { AppState, NativeModules } from 'react-native';
import { RNLogs } from 'react-native-rnlogs';

// 应用状态监听
AppState.addEventListener('change', (nextState) => {
  if (nextState === 'background') {
    RNLogs.addBreadcrumb('应用进入后台', 'lifecycle');
    RNLogs.flush();
  } else if (nextState === 'active') {
    RNLogs.addBreadcrumb('应用回到前台', 'lifecycle');
  }
});

// 检查崩溃报告（建议在应用启动时调用）
async function checkCrashReport() {
  try {
    const NativeLogs = NativeModules.RNLogsModule;
    if (NativeLogs) {
      const hasReport = await NativeLogs.hasPendingCrashReport();
      if (hasReport) {
        const report = await NativeLogs.consumeCrashReport();
        console.warn('检测到上次崩溃:', report);
        // 上报或展示给用户
      }
    }
  } catch (e) {
    // 忽略
  }
}
```

### 错误边界集成

```typescript
import React from 'react';
import { RNLogs, LogLevel } from 'react-native-rnlogs';

class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    RNLogs.log(LogLevel.ERROR, `React ErrorBoundary: ${error.message}`, {
      componentStack: errorInfo.componentStack,
      errorName: error.name,
      errorStack: error.stack,
    });
    RNLogs.flush();
  }

  render() {
    return this.props.children;
  }
}
```

### 多环境配置

```typescript
import { RNLogs, LogLevel } from 'react-native-rnlogs';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

const isDev = __DEV__;

RNLogs.init({
  enabled: true,
  environment: isDev ? 'development' : 'production',
  release: DeviceInfo.getVersion(),
  device: {
    deviceId: DeviceInfo.getUniqueId(),
    platform: Platform.OS,
    osVersion: Platform.Version as string,
    brand: DeviceInfo.getBrand(),
    model: DeviceInfo.getModel(),
  },
  upload: {
    endpoint: isDev
      ? 'http://10.0.2.2:3000/api/logs'     // Android 模拟器
      : 'https://logs.example.com/api/v1/batch',
    apiKey: isDev ? 'dev-key' : 'prod-key',
    maxRetries: isDev ? 1 : 5,
    compress: !isDev,
  },
  maxBatchSize: isDev ? 10 : 100,
  flushIntervalMs: isDev ? 2000 : 5000,
  enablePerformanceCollector: !isDev,
  beforeSend: isDev
    ? (event) => {
        console.log('[RNLogs]', LogLevel[event.level], event.message);
        return event;
      }
    : undefined,
});
```

---

## API 速查表

| API | 方法签名 | 说明 |
|-----|----------|------|
| `init` | `(config?: RNLogsConfig) => void` | 初始化 SDK |
| `log` | `(level: LogLevel, message: string, data?) => void` | 记录日志 |
| `setUser` | `(user: UserInfo \| null) => void` | 设置/清除用户 |
| `addBreadcrumb` | `(message: string, category?, data?) => void` | 记录面包屑 |
| `trackAction` | `(action: string, data?) => void` | 追踪用户行为 |
| `trackScreen` | `(screenName: string, data?) => void` | 追踪页面导航 |
| `flush` | `() => void` | 强制刷新缓冲区 |
| `getOfflineSize` | `() => Promise<number>` | 获取离线队列大小 |
| `destroy` | `() => void` | 销毁 SDK |
| `getSessionId` | `() => string` | 获取会话 ID |
| `getDevice` | `() => DeviceInfo \| undefined` | 获取设备信息 |
| `getAppInfo` | `() => AppInfo` | 获取应用信息 |
| `getBreadcrumbs` | `() => readonly Breadcrumb[]` | 获取面包屑 |

---

## 导出清单

```typescript
import {
  // 单例实例
  RNLogs,

  // 枚举
  LogLevel,
  EventType,
  EventSource,
  LogLevelName,

  // 类型（TypeScript 类型导入）
  type RNLogsConfig,
  type LogEvent,
  type UserInfo,
  type Breadcrumb,
  type BatcherConfig,
  type ApiLogData,
  type PerformanceMetrics,
  type NativeModule,
  type DeviceInfo,
  type AppInfo,
  type BatchPayload,
  type ExceptionData,
  type RequestData,
  type ActionData,
  type UploadConfig,
} from 'react-native-rnlogs';
```
