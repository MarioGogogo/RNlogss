# RNlogss - React Native 智能日志采集与上报系统 (Phase 1)

`RNlogss` 是一个针对 React Native 应用设计的高性能、高可靠性的日志采集与自动上报 SDK（Phase 1 验证版）及其实例工程。本项目集成了 JS 异常捕获、网络请求监控、性能指标采集、用户行为追踪、离线缓存和批量上报等核心功能。

---

## 🚀 项目概览 (Project Overview)

在 React Native 应用中，由于跨端架构的特殊性，日志收集不仅需要处理传统的 JavaScript 错误，还需要关联设备信息、用户信息、网络状态以及用户操作轨迹。本系统提供了一个统一的 SDK：`RNLogs`，并在本工程的测试页面中提供了全套的可视化测试用例。

### 📦 核心特性

*   **异常自动捕获 (Exception Collector)**：自动捕获 React Native 中的 JS 未捕获异常（通过全局劫持 `ErrorUtils`）以及未处理的 Promise Rejections。
*   **网络拦截监控 (API Collector)**：自动监控并采集 `fetch` 和 `XMLHttpRequest` 请求，包含请求路径、方法、HTTP 状态码、持续时长及错误原因。
*   **用户轨迹追踪 (Operation Collector)**：记录面包屑（Breadcrumbs）日志，包括路由跳转（Navigation）和用户自定义行为，以便在发生崩溃时快速回溯。
*   **性能指标采集 (Performance Collector)**：支持定时采集设备的 FPS、内存占用、JS 堆大小等基础性能指标。
*   **高效批处理缓存 (Log Batcher & Queue)**：采用双层队列架构。首层内存批处理器支持按数量（`maxBatchSize`）或按时间间隔（`flushIntervalMs`）聚合日志。
*   **可靠离线重试 (Offline Cache & Uploader)**：在网络不可用或上报失败时，将日志自动转储至离线队列，并开启后台 30 秒轮询重传，支持可配置的重试延迟和次数。

---

## 📂 项目目录结构 (Directory Structure)

```text
RNlogss/
├── src/                      # RNLogs SDK 核心源码
│   ├── index.ts              # SDK 导出入口
│   ├── RNLogsModule.ts       # SDK 主控类 (RNLogs)
│   ├── types.ts              # 数据结构与类型定义
│   ├── collectors/           # 自动日志收集器
│   │   ├── ApiCollector.ts          # 网络监控
│   │   ├── ExceptionCollector.ts    # 异常捕获
│   │   ├── OperationCollector.ts    # 面包屑与行为
│   │   └── PerformanceCollector.ts  # 性能采集
│   ├── core/                 # 批处理核心逻辑
│   │   ├── LogBatcher.ts            # 日志打包聚合器
│   │   └── LogQueue.ts              # 队列管理
│   ├── storage/              # 本地持久化逻辑
│   │   └── OfflineQueue.ts          # 离线日志存储 (Phase 1 内存队列)
│   ├── uploader/             # 网络上报核心
│   │   ├── Uploader.ts              # 负责实际 HTTP 上报
│   │   ├── UploadQueue.ts           # 上报管理与离线重试逻辑
│   │   └── UploadConfig.ts          # 上报配置定义
│   └── native/               # 原生对接桥梁 (Phase 1 留空)
├── App.tsx                   # Phase 1 功能验证与交互测试页面
├── android/                  # Android 原生工程
├── ios/                      # iOS 原生工程
├── package.json              # 项目配置文件与依赖项
└── tsconfig.json             # TypeScript 配置
```

---

## 🛠️ 项目运行指南 (Getting Started)

### 1. 准备工作

请确保您的本地开发环境已安装以下工具：
*   **Node.js** >= 20
*   **Yarn** 或 **npm**
*   **CocoaPods** (仅 macOS/iOS 构建需要)

### 2. 安装依赖

在项目根目录下执行以下命令安装项目所需的 JS 依赖：

```bash
npm install
# 或者
yarn install
```

如果您是在 macOS 上开发并需要启动 iOS 模拟器，请安装 iOS 原生依赖：

```bash
# 安装 CocoaPods 依赖包
bundle install
bundle exec pod install
```

### 3. 运行项目

首先，启动 React Native 编译服务器 Metro：

```bash
npm start
# 或者
yarn start
```

保持 Metro 窗口开启，新建终端并运行相应的平台客户端：

#### 运行 iOS

```bash
npm run ios
# 或者
yarn run ios
```

#### 运行 Android

```bash
npm run android
# 或者
yarn run android
```

---

## 🧪 功能验证测试页面 (Test Sandbox)

项目提供了一个直观的测试界面：[App.tsx](file:///Users/lovewcc/Documents/Me/ReactNative/RNlogss/App.tsx)，用以验证 SDK 各核心特性的执行情况。

### 测试面板组件说明：
1.  **手动日志**: 点击可打一条普通日志并实时记录。
2.  **JS 常见错误**:
    *   *访问 undefined 属性*
    *   *调用 undefined 函数*
    *   *JSON.parse 无效字符串*
    *   *数组越界访问*
    *   *类型错误：null 调用方法*
    *   *触发异步异常 (Promise Reject)*
    上述所有行为均会被 `ExceptionCollector` 自动捕获并上传。
3.  **网络与异步**:
    *   *模拟网络 404 请求*：触发 API 异常上报。
    *   *模拟网络超时*：触发请求超时异常。
    *   *正常请求并上报日志*：记录正常网络耗时和状态。
4.  **操作与面包屑**:
    *   *切换页面*：模拟页面级跳转并追踪页面名。
    *   *添加面包屑*：手动加入行为链路。
    *   *立即 Flush*：将缓冲区内的所有日志强制上报。
5.  **实时状态栏**: 页面顶部实时渲染 **"已触发操作数"** 和 **"离线队列大小"**，用以直观验证断网缓存及后台重传（每 30 秒）的逻辑。

---

## 📖 快速上手使用 (Usage)

### 1. 初始化 SDK

在应用的入口文件（例如 [index.js](file:///Users/lovewcc/Documents/Me/ReactNative/RNlogss/index.js) 或 [App.tsx](file:///Users/lovewcc/Documents/Me/ReactNative/RNlogss/App.tsx) 顶部）进行初始化：

```typescript
import { RNLogs, LogLevel } from './src';
import { Platform } from 'react-native';

RNLogs.init({
  environment: 'production',         // 环境区分
  release: '1.0.0',                  // 版本号
  enablePerformanceCollector: true,  // 开启性能指标监控
  maxBatchSize: 10,                  // 满 10 条日志即触发上报
  flushIntervalMs: 5000,             // 距离上次上报满 5 秒即强制上报
  device: {
    deviceId: 'device-unique-id',
    platform: Platform.OS,
    osVersion: Platform.Version?.toString() ?? 'unknown',
  },
  upload: {
    endpoint: 'https://your-log-server.com/api/v1/logs', // 您的接收端 API 地址
    maxRetries: 3,                  // 上报失败最大重试次数
    retryDelayMs: 1000,             // 重试间隔时间 (ms)
    batchSize: 10,                  // 单次上报的最大批次大小
  },
  beforeSend: (event) => {
    // 过滤或修改日志事件，返回 null 则丢弃该条日志
    if (event.message.includes('sensitive-data')) {
      return null; 
    }
    return event;
  }
});
```

### 2. 设置当前登录用户

当用户登录成功后，可注入用户信息关联至后续的所有日志：

```typescript
RNLogs.setUser({
  id: 'user_9527',
  name: '华安',
  email: 'huaan@example.com'
});
```

### 3. 手动记录日志

```typescript
// 记录常规的业务信息
RNLogs.log(LogLevel.INFO, '用户进入购物车页面', { cartItemCount: 3 });

// 记录非致命性错误
RNLogs.log(LogLevel.WARN, '接口数据结构校验异常', { apiPath: '/api/v1/user' });
```

### 4. 追踪面包屑轨迹

```typescript
// 在用户点击特定按钮、执行特定动作时添加
RNLogs.addBreadcrumb('用户点击了支付按钮', 'user_action');
```

---

## ⚖️ 协议 (License)

本项目仅用于内部评估、功能验证与测试用途。
