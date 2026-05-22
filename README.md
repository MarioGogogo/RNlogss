# RNlogss - React Native 智能日志采集与上报系统 (Phase 1 & Phase 2)

`RNlogss` 是一个针对 React Native 应用设计的高性能、高可靠性的日志采集与自动上报 SDK 及其实例工程。目前已完成 **Phase 1（JS 业务层监控与上报）** 及 **Phase 2（TurboModule + JSI 高性能 C++ 桥接通道）** 的核心功能建设与联调。

---

## 🚀 项目概览 (Project Overview)

在 React Native 应用中，传统 Bridge 架构在传输高频、大量的日志数据时容易因序列化和异步线程排队导致主线程卡顿（Jank）。本项目通过双阶段演进，实现了一套既有完备业务捕获能力，又有高性能原生通道 of 日志引擎：

*   **Phase 1（JS 侧业务层）**：负责全局异常劫持、网络请求拦截、面包屑操作链追踪和设备/性能指标采集，提供内存缓冲和离线持久化重试。
*   **Phase 2（C++ 侧原生层）**：通过 JSI（JavaScript Interface）机制，在 JS 引擎全局直接注入 `__rnlogsInternal` 原生宿主对象（Host Object），绕过传统 Bridge，实现微秒级（μs）同步写入 C++ 原生高速内存环形队列（RingBuffer）。

### 📦 核心特性

*   **异常自动捕获 (Exception Collector)**：自动捕获 React Native 中的 JS 未捕获异常（通过全局劫持 `ErrorUtils`）以及未处理的 Promise Rejections。
*   **网络拦截监控 (API Collector)**：自动监控并采集 `fetch` 和 `XMLHttpRequest` 请求，包含请求路径、方法、HTTP 状态码、持续时长及错误原因。
*   **用户轨迹追踪 (Operation Collector)**：记录面包屑（Breadcrumbs）日志，包括路由跳转（Navigation）和用户自定义行为，以便在发生崩溃时快速回溯。
*   **性能指标采集 (Performance Collector)**：支持定时采集设备的 FPS、内存占用、JS 堆大小等基础性能指标。
*   **JSI 原生同步通道 (JSI Sync Bridge)**：通过 JNI 导出 JSI 引擎指针，在 JS 全局暴露出 `global.__rnlogsInternal`。所有 JS 日志可无需异步排队，直接同步写入 C++ 层。
*   **C++ 线程安全队列 (C++ Thread-Safe Queue)**：底层基于 C++ 的 `LogQueue` 实现，内置 `std::mutex` 线程锁，支持多线程安全并发写入；具备队列最大水位控制（默认限制 `maxSize = 1000`），当溢出时自动丢弃最旧日志，防止 OOM 隐患。
*   **可靠离线重试 (Offline Cache & Uploader)**：在网络不可用或上报失败时，将日志自动转储至离线队列，并开启后台 30 秒轮询重传，支持可配置的重试延迟和次数。

---

## 📂 项目目录结构 (Directory Structure)

```text
RNlogss/
├── cpp/                      # C++ 原生层源码 (Phase 2 新增)
│   ├── core/                 # C++ 核心队列逻辑
│   │   ├── LogQueue.cpp             # 线程安全日志缓冲环形队列实现
│   │   └── LogQueue.h               # 队列接口定义
│   └── jsi/                  # JSI 绑定映射层
│       ├── RNLogsJSIBinding.cpp     # 将 HostFunction 注入 JS 运行时的绑定实现
│       └── RNLogsJSIBinding.h       # 绑定对象接口定义
├── src/                      # RNLogs SDK 核心源码
│   ├── index.ts              # SDK 导出入口
│   ├── RNLogsModule.ts       # SDK 主控类 (处理初始化及 JSI 原生挂载)
│   ├── types.ts              # 数据结构与类型定义
│   ├── collectors/           # 自动日志收集器
│   │   ├── ApiCollector.ts          # 网络监控
│   │   ├── ExceptionCollector.ts    # 异常捕获
│   │   ├── OperationCollector.ts    # 面包屑与行为
│   │   └── PerformanceCollector.ts  # 性能采集
│   ├── core/                 # 批处理核心逻辑
│   │   ├── LogBatcher.ts            # 日志打包聚合器
│   │   └── LogQueue.ts              # 队列管理 (JS 内存队列)
│   ├── native/               # 原生对接桥梁 (JSI 未加载时的降级逻辑)
│   │   └── NoOpNativeModule.ts      # NativeModule 兼容类
│   ├── specs/                # Codegen 协议及全局类型声明 (Phase 2 新增)
│   │   └── NativeRNLogs.ts          # __rnlogsInternal 全局变量声明与 JSI 可用性判定
│   ├── storage/              # 本地持久化逻辑
│   │   └── OfflineQueue.ts          # 离线日志存储
│   └── uploader/             # 网络上报核心
│       ├── Uploader.ts              # 负责实际 HTTP 上报
│       ├── UploadQueue.ts           # 上报管理与离线重试逻辑
│       └── UploadConfig.ts          # 上报配置定义
├── android/                  # Android 原生工程 (包含 CMakeLists / JNI / NDK 配置)
│   └── app/src/main/jni/     # C++ 编译与加载配置
│       ├── CMakeLists.txt           # NDK 编译配置文件
│       └── OnLoad.cpp               # JNI 入口 (初始化并调用 JSIBinding)
├── ios/                      # iOS 原生工程
├── App.tsx                   # 双 Phase 功能验证与交互测试沙盒页面
├── package.json              # 项目配置文件与依赖项
└── tsconfig.json             # TypeScript 配置
```

---

## 🛠️ 项目运行指南 (Getting Started)

### 1. 准备工作

请确保您的本地开发环境已安装以下工具：
*   **Node.js** >= 20
*   **Yarn** 或 **npm**
*   **Android NDK** (编译 JSI C++ 原生库需要，推荐 23+)
*   **CMake** (用于 Android NDK 原生编译)
*   **CocoaPods** (仅 macOS/iOS 构建需要)

### 2. 安装依赖

在项目根目录下执行以下命令安装项目所需的 JS 依赖：

```bash
npm install
# 或者
yarn install
```

### 3. 原生工程编译配置 (Android CMake 关联)

项目在 Android 端通过 CMake 编译 C++ 源码。在 `android/app/build.gradle` 中已关联如下 Native 编译选项：

```groovy
android {
    // ...
    externalNativeBuild {
        cmake {
            path "src/main/jni/CMakeLists.txt"
        }
    }
}
```

在首次运行时，原生编译器将自动配置 CMake 缓存并编译 `appmodules` 共享库。

### 4. 运行项目

首先，启动 React Native 编译服务器 Metro：

```bash
npm start
# 或者
yarn start
```

保持 Metro 窗口开启，新建终端并运行相应的平台客户端：

#### 运行 Android（推荐，当前已完整打通 JSI 通道）

```bash
npm run android
# 或者
yarn run android
```

#### 运行 iOS

```bash
npm run ios
# 或者
yarn run ios
```

---

## 🧪 功能验证测试页面 (Test Sandbox)

项目在 `App.tsx` 中实现了一个功能完善的双 Tab 测试沙盒面板，您可以方便地在两个阶段的功能之间进行切换和验证：

### Tab 1: Phase 1 (JS MVP)
本面板用于验证基于 JavaScript 层的收集和上报逻辑：
1.  **手动日志**: 点击打一条普通日志并实时记录。
2.  **JS 常见错误**: 包括*访问 undefined 属性*、*调用 undefined 函数*、*JSON 转换无效字符串*、*数组越界*、*类型错误（null 调用方法）*以及*触发异步异常*。所有的 Crash 均由 `ExceptionCollector` 自动捕获。
3.  **网络与异步**: 支持模拟网络 404、网络超时请求、正常请求并上报。
4.  **操作与面包屑**: 模拟页面跳转、手动添加面包屑链路、立即强制触发日志上报（Flush）。
5.  **实时状态栏**: 顶部渲染“已触发操作”和“离线队列大小”，可以断开网络来测试离线缓冲和 30s 轮询自动重传机制。

### Tab 2: Phase 2 (JSI C++)
本面板专门用于验证 JS 到 C++ 原生层的 JSI 同步通道性能与稳定性：
1.  **JSI 注入状态 (JSI Status)**: 实时展示 `global.__rnlogsInternal` 是否已成功注入 React Native 的 JS 引擎运行时。
2.  **C++ 内存队列长度 (Queue Size)**: 同步读取 C++ 底层 `LogQueue` 中的现有日志数。
3.  **单条同步写入 C++**: 绕过 React Native Bridge 异步队列，同步往 C++ 内存中追加一条 JSON 日志。
4.  **批量同步写入 C++**: 一次性将多条日志的批量 JSON 格式数据写入 C++ 原生队列。
5.  **500 条高频压测 (Stress Test)**: 极速循环 500 次写入 C++ 原生层，并在下方显示压测的精确耗时（通常在 10 毫秒以内完成），以此验证 JSI 的极高吞吐性能。
6.  **清空 C++ 内存队列**: 重置 C++ 层的日志缓存。

---

## 📖 快速上手使用 (Usage)

### 1. 初始化 SDK

在应用的入口文件（例如 `index.js` 或 `App.tsx` 顶部）进行初始化。在初始化时，SDK 会通过 `NativeModules.RNLogsModule.install()` 同步完成 JSI 的全局挂载，并自动将捕获的事件灌入 C++：

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
    endpoint: 'https://your-log-server.com/api/v1/logs', // 接收端 API 地址
    maxRetries: 3,                  // 上报失败最大重试次数
    retryDelayMs: 1000,             // 重试间隔时间 (ms)
    batchSize: 10,                  // 单次上报的最大批次大小
  },
});
```

### 2. 使用 JSI 接口进行同步底层写入

当需要追求极限写入性能或在 Crash 瞬间同步保护日志时，可直接通过 `__rnlogsInternal` 接口进行同步写入：

```typescript
import { isJsiAvailable } from './src/specs/NativeRNLogs';

if (isJsiAvailable()) {
  // 1. 同步单条写入
  global.__rnlogsInternal.writeLog(JSON.stringify({
    level: 'INFO',
    message: '业务关键节点日志',
    timestamp: Date.now()
  }));

  // 2. 获取当前 C++ 队列积压的日志条数
  const size = global.__rnlogsInternal.getQueueSize();
  console.log(`当前原生队列中共有 ${size} 条日志`);
}
```

### 3. 设置当前登录用户与追踪面包屑 (与 Phase 1 保持一致)

```typescript
// 关联用户信息
RNLogs.setUser({
  id: 'user_9527',
  name: '华安',
  email: 'huaan@example.com'
});

// 手动添加面包屑
RNLogs.addBreadcrumb('用户点击了支付按钮', 'user_action');
```

---

## ⚖️ 协议 (License)

本项目仅用于内部评估、功能验证与测试用途。
