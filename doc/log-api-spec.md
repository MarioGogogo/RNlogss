# 日志上报接口文档

## 1. 接口基本信息

| 项目 | 说明 |
|------|------|
| 请求方法 | `POST` |
| 请求地址 | 由客户端配置传入（如 `https://your-domain.com/api/logs`） |
| Content-Type | `application/json` |
| 自定义请求头 | `X-Api-Key`: API 密钥（如有配置） |

---

## 2. 请求体 `BatchPayload`

```json
{
  "sdk": "rnlogs",
  "sdkVersion": "1.0.0",
  "batchId": "1715923200000-abc123",
  "sessionId": "sess-1715923200000-xyz789",
  "timestamp": 1715923200000,
  "batchSize": 10,
  "device": {
    "deviceId": "dev-android-9a8b7c",
    "platform": "android",
    "osVersion": "14",
    "brand": "Google",
    "model": "Pixel 8",
    "screenWidth": 1080,
    "screenHeight": 2400
  },
  "app": {
    "version": "1.0.0",
    "buildNumber": "42",
    "environment": "production",
    "release": "1.2.0"
  },
  "breadcrumbs": [
    { "message": "App launched", "category": "lifecycle", "timestamp": 1715923100000 },
    { "message": "Screen: HomeScreen", "category": "navigation", "timestamp": 1715923100100 },
    { "message": "button_click", "category": "action", "timestamp": 1715923150000, "data": { "buttonId": "login" } }
  ],
  "events": [ /* LogEvent 数组 */ ]
}
```

### 批次级字段

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `sdk` | `string` | 是 | SDK 标识，固定值 `rnlogs` |
| `sdkVersion` | `string` | 是 | SDK 版本，当前 `1.0.0` |
| `batchId` | `string` | 是 | 批次唯一 ID，格式 `${timestamp}-${random}` |
| `sessionId` | `string` | 是 | 会话 ID，一次 App 启动生成一个，用于关联同会话事件 |
| `timestamp` | `number` | 是 | 上报时毫秒级时间戳 |
| `batchSize` | `number` | 是 | 本批次日志事件数量 |
| `device` | `DeviceInfo` | 否 | 设备信息（整个会话共享） |
| `app` | `AppInfo` | 否 | 应用信息（整个会话共享） |
| `breadcrumbs` | `Breadcrumb[]` | 否 | 操作轨迹（提升至批次级别，避免每条事件重复） |
| `events` | `LogEvent[]` | 是 | 日志事件数组 |

---

## 3. 单条日志事件 `LogEvent`

```json
{
  "id": "1715923199000-abc123",
  "type": "manual",
  "source": "manual",
  "level": 2,
  "levelName": "info",
  "message": "用户点击登录按钮",
  "timestamp": 1715923199000,
  "data": {},
  "user": { "id": "user_001" },
  "tags": { "page": "login" },
  "context": { "environment": "production", "release": "1.2.0" }
}
```

### 事件级字段

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | `string` | 是 | 日志唯一 ID，格式 `${timestamp}-${random}` |
| `type` | `EventType` | 是 | 日志类型枚举，见 §4.1 |
| `source` | `EventSource` | 是 | 事件来源枚举，见 §4.2 |
| `level` | `number` | 是 | 日志级别：`0`-VERBOSE, `1`-DEBUG, `2`-INFO, `3`-WARN, `4`-ERROR, `5`-FATAL |
| `levelName` | `string` | 是 | 日志级别名称：`verbose` / `debug` / `info` / `warn` / `error` / `fatal` |
| `message` | `string` | 是 | 日志消息内容 |
| `timestamp` | `number` | 是 | 日志产生时的毫秒级时间戳 |
| `data` | `object` | 否 | 附加业务数据 |
| `exception` | `ExceptionData` | 否 | 异常结构化数据（仅 `type=exception`） |
| `request` | `RequestData` | 否 | API 请求结构化数据（仅 `type=api`） |
| `action` | `ActionData` | 否 | 操作/导航结构化数据（仅 `type=action` 或 `type=navigation`） |
| `performance` | `PerformanceMetrics` | 否 | 性能指标数据（仅 `type=performance`） |
| `user` | `UserInfo` | 否 | 用户信息（统一 enrich，所有事件均可携带） |
| `tags` | `object` | 否 | 自定义标签键值对 |
| `context` | `object` | 否 | 上下文信息（如环境、版本号） |

---

## 4. 枚举定义

### 4.1 `EventType` 日志类型

| 值 | 说明 | 对应结构化字段 |
|----|------|---------------|
| `manual` | 手动调用 `log()` 产生 | `data` |
| `api` | API 请求监控 | `request` |
| `exception` | JS 异常捕获 | `exception` |
| `action` | 用户操作追踪 | `action` |
| `navigation` | 页面导航追踪 | `action` |
| `performance` | 性能指标采样 | `performance` |

### 4.2 `EventSource` 事件来源

| 值 | 说明 |
|----|------|
| `manual` | 手动调用 |
| `api` | ApiCollector 自动采集 |
| `exception` | ExceptionCollector 自动采集 |
| `operation` | OperationCollector 自动采集 |
| `performance` | PerformanceCollector 自动采集 |

---

## 5. 子结构定义

### 5.1 `DeviceInfo` 设备信息（批次级别）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `deviceId` | `string` | 是 | 设备唯一标识 |
| `platform` | `string` | 是 | 平台：`ios` / `android` |
| `osVersion` | `string` | 是 | 操作系统版本号 |
| `brand` | `string` | 否 | 设备品牌 |
| `model` | `string` | 否 | 设备型号 |
| `screenWidth` | `number` | 否 | 屏幕宽度（px） |
| `screenHeight` | `number` | 否 | 屏幕高度（px） |

### 5.2 `AppInfo` 应用信息（批次级别）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `version` | `string` | 是 | 应用版本号 |
| `buildNumber` | `string` | 否 | 构建号 |
| `environment` | `string` | 否 | 运行环境：`development` / `staging` / `production` |
| `release` | `string` | 是 | 发布版本标识 |

### 5.3 `UserInfo` 用户信息

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | `string` | 是 | 用户唯一标识 |
| `name` | `string` | 否 | 用户名称 |
| `email` | `string` | 否 | 用户邮箱 |
| 其他字段 | `any` | 否 | 允许扩展任意自定义属性 |

### 5.4 `Breadcrumb` 面包屑（批次级别）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `message` | `string` | 是 | 描述文本 |
| `category` | `string` | 否 | 分类，如 `action`、`navigation`、`lifecycle` |
| `timestamp` | `number` | 是 | 产生时间戳 |
| `data` | `object` | 否 | 附加数据 |

---

## 6. 结构化日志数据（按 `type` 分类）

### 6.1 `ExceptionData` — `type=exception`

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `name` | `string` | 是 | 异常类型名，如 `TypeError`、`ReferenceError` |
| `stack` | `string` | 是 | 异常堆栈信息 |
| `isFatal` | `boolean` | 是 | 是否为致命错误 |

**示例：**
```json
{
  "id": "1715923199000-x9y8z7",
  "type": "exception",
  "source": "exception",
  "level": 5,
  "levelName": "fatal",
  "message": "Cannot read property 'someProperty' of undefined",
  "timestamp": 1715923199000,
  "exception": {
    "name": "TypeError",
    "stack": "TypeError: Cannot read property...\n    at App (App.bundle:113:14)",
    "isFatal": true
  },
  "user": { "id": "user_001", "name": "Test User" },
  "tags": { "platform": "android" },
  "context": { "environment": "development", "release": "1.0.0" }
}
```

### 6.2 `RequestData` — `type=api`

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `url` | `string` | 是 | 请求 URL |
| `method` | `string` | 是 | HTTP 方法 |
| `statusCode` | `number` | 否 | 响应状态码 |
| `durationMs` | `number` | 是 | 请求耗时（毫秒） |
| `requestId` | `string` | 否 | 请求追踪 ID |
| `errorMessage` | `string` | 否 | 请求异常时的错误信息 |
| `requestHeaders` | `object` | 否 | 请求头（预留） |
| `responseHeaders` | `object` | 否 | 响应头（预留） |

**示例：**
```json
{
  "id": "1715923199000-a1b2c3",
  "type": "api",
  "source": "api",
  "level": 2,
  "levelName": "info",
  "message": "[API] POST http://example.com/api/logs — 647ms",
  "timestamp": 1715923199000,
  "request": {
    "url": "http://example.com/api/logs",
    "method": "POST",
    "statusCode": 200,
    "durationMs": 647
  },
  "user": { "id": "user_001" },
  "tags": { "platform": "android" },
  "context": { "environment": "development", "release": "1.0.0" }
}
```

### 6.3 `ActionData` — `type=action` / `type=navigation`

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `name` | `string` | 是 | 操作名称或页面名称 |
| `screen` | `string` | 否 | 导航目标页（仅 `type=navigation` 时填充） |

**示例：**
```json
{
  "id": "1715923199000-d4e5f6",
  "type": "action",
  "source": "operation",
  "level": 2,
  "levelName": "info",
  "message": "[Action] button_click",
  "timestamp": 1715923199000,
  "data": { "buttonId": "manualLog" },
  "action": {
    "name": "button_click"
  },
  "user": { "id": "user_001" },
  "tags": { "platform": "android" },
  "context": { "environment": "development", "release": "1.0.0" }
}
```

### 6.4 `PerformanceMetrics` — `type=performance`

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `memory` | `object` | 否 | JS 堆内存：`{ used: number, total: number }`（MB） |
| `jsHeapSize` | `number` | 否 | JS 堆大小（MB） |
| `fps` | `number` | 否 | 帧率（预留） |

**示例：**
```json
{
  "id": "1715923199000-g7h8i9",
  "type": "performance",
  "source": "performance",
  "level": 1,
  "levelName": "debug",
  "message": "[Performance] metrics sample",
  "timestamp": 1715923199000,
  "performance": {
    "jsHeapSize": 12,
    "memory": { "used": 12, "total": 48 }
  }
}
```

---

## 7. 日志类型与级别映射

| `type` | `source` | 默认 `level` | `levelName` | 触发方式 |
|--------|----------|--------------|-------------|----------|
| `manual` | `manual` | 用户指定 | 用户指定 | `RNLogs.log()` |
| `api` | `api` | `2`(INFO) / `4`(ERROR) | `info` / `error` | 自动拦截 `fetch` |
| `exception` | `exception` | `4`(ERROR) / `5`(FATAL) | `error` / `fatal` | 自动捕获 JS 异常 |
| `action` | `operation` | `2`(INFO) | `info` | `RNLogs.trackAction()` |
| `navigation` | `operation` | `2`(INFO) | `info` | `RNLogs.trackScreen()` |
| `performance` | `performance` | `1`(DEBUG) | `debug` | 定时自动采样 |

---

## 8. 服务端响应约定

| 状态码 | 处理方式 |
|--------|----------|
| `2xx` | SDK 视为成功，清空已发送批次 |
| `4xx` | SDK 直接丢弃该批次，不再重试 |
| `5xx` / 网络异常 | SDK 指数退避重试，默认最多 3 次 |

---

## 9. 后端建表建议

### 核心索引字段

| 字段 | 索引类型 | 用途 |
|------|---------|------|
| `type` | B-Tree | 按日志类型快速筛选 |
| `source` | B-Tree | 按事件来源聚合分析 |
| `level` + `levelName` | B-Tree | 按严重级别过滤告警 |
| `sessionId` | B-Tree | 按会话关联完整操作链 |
| `batchId` | B-Tree | 按批次追溯上报记录 |
| `timestamp` | B-Tree | 时间范围查询 |
| `user.id` | B-Tree | 按用户维度分析 |
| `device.platform` | B-Tree | 按平台维度统计 |
| `exception.name` | B-Tree（可选） | 异常类型聚合分析 |
| `request.url` | B-Tree（可选） | API 性能分析 |

### 分表策略建议

- `logs_exception` — `type=exception`，包含 `exception` 结构化字段
- `logs_api` — `type=api`，包含 `request` 结构化字段
- `logs_action` — `type=action`/`navigation`，包含 `action` 结构化字段
- `logs_performance` — `type=performance`，包含 `performance` 结构化字段
- `logs_manual` — `type=manual`，通用日志表
