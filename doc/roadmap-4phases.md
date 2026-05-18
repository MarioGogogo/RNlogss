# RNLogs SDK 4 阶段渐进式实现路线图

> 目标：从纯 JS 层逐步演进为生产级 Native SDK，每个阶段都可编译、可运行、可验证。

---

## Phase 1: JS Layer MVP（纯 JavaScript，零 Native 依赖）

**目标**：搭建完整的 JS 层架构，日志仅在控制台输出，应用能正常运行。

### 核心任务
1. **SDK 入口** — `RNLogsModule.ts` 单例类
   - `init(config)` 初始化
   - `log(level, message, data)` 手动日志
   - `setUser(user)` / `addBreadcrumb()` / `flush()`
2. **4 个收集器**
   - `ExceptionCollector` — `ErrorUtils.setGlobalHandler`
   - `ApiCollector` — `patchFetch()` 拦截网络请求
   - `OperationCollector` — `trackAction()` / `trackScreen()`
   - `PerformanceCollector` — FPS + 内存定时采样
3. **JS 层队列与批处理**
   - `LogQueue` — 内存数组，最大 1000 条，满则丢弃最旧
   - `LogBatcher` — 定时/容量触发，调用 `console.log` 输出批次 JSON
4. ** 集成**
   - App.tsx 中引入 SDK 并测试所有 API

### 关键设计
- 所有 Native 调用点用 mock 对象代替（`NoOpNativeModule`）
- 日志最终通过 `console.log` 输出，方便验证
- 类型定义全部到位（`LogEvent`, `LogLevel`, `BatcherConfig` 等）

### 验收标准
```bash
 npm run android    # 能编译并运行
# 在 Metro 控制台应看到格式化的 JSON 日志批次输出
```

---

## Phase 2: TurboModule + JSI 桥接（打通 JS → C++）

**目标**：定义 TurboModule Spec，实现 C++ JSI 绑定，让 JS 层能同步调用到 C++ 层。

### 核心任务
1. **TurboModule Spec** — `NativeRNLogs.ts`
   - Codegen 输入接口（`initialize`, `writeLogBatch`, `writeLog`, `flush`, `getQueueSize`）
2. **Android 端搭建**
   - `RNLogsPackage.kt` / `RNLogsModule.kt` Kotlin 模块
   - `CMakeLists.txt` 基础配置（仅编译 JSI 绑定 + 空方法）
   - `OnLoad.cpp` — JNI 入口，调用 `RNLogsJSIBinding::install()`
3. **C++ JSI 绑定骨架** — `RNLogsJSIBinding.cpp/.h`
   - `install()` — 在 JS 全局注册 `__rnlogsInternal` 对象
   - `initialize(configJson)` — 解析 JSON，初始化 C++ `LogQueue`
   - `writeLogBatch(batchJson)` — 解析 JSON，调用 `LogQueue::push()`
   - `writeLog(logData)` — 单条 push
   - `flush()` / `getQueueSize()` — 空实现或返回固定值
4. **C++ LogQueue 基础版**
   - 仅内存环形缓冲区（无持久化）
   - `push()`, `dequeue()`, `size()`, `clear()`
5. **JS 层接入**
   - `LogBatcher.flushBatch()` 真正调用 `NativeRNLogs.writeLogBatch()`

### 关键设计
- CMakeLists.txt 需要正确处理 `-Wl,-z,nodefs` 或 `target_link_libraries(reactnativejni)` 以解决 JSI 符号链接问题
- C++ 层所有方法先做空实现，保证编译通过
- JSI 的 JSON 解析用简单字符串操作，不引入第三方库

### 验收标准
```bash
cd example && npm run android    # 编译通过
# 在 C++ 中打 log，确认 JS 调用能到达 C++ 层
# LogQueue size 能在 JS 层正确返回
```

---

## Phase 3: 核心引擎（批处理 + 序列化 + 持久化 + 上传）

**目标**：C++ 层实现完整的日志批处理、压缩加密、磁盘持久化、HTTP 上传链路。

### 核心任务
1. **C++ LogBatcher（独立线程）**
   - `workerLoop()` 条件变量等待（定时/容量/flush 触发）
   - `processBatch()` 从队列取数据，调用序列化
2. **LogSerializer**
   - `serializeBatch()` — 自定义二进制格式 `[count:4][len:4][json]...`
   - `deserializeBatch()` — 逆向解析
3. **Compression + Crypto**
   - `Compression::gzipCompress()` / `gzipDecompress()`
   - `Crypto::encryptAesGcm()` / `decryptAesGcm()`（AES-256-GCM + 随机 IV）
4. **LogQueue 持久化**
   - 满时溢出到磁盘 `queue.dat`
   - 启动时 `recoverFromDisk()`
   - 磁盘空间管理 `cleanupDiskStorage()`
5. **HttpTransport 抽象**
   - 基类 `HttpTransport`（纯虚接口）
   - Android 实现 `HttpTransportAndroid.cpp`（使用 OkHttp 或原生 HTTP）
   - 重试策略：指数退避，maxRetries=3
6. **配置系统**
   - 从 JSON 解析 `BatcherConfig`（batchSize, interval, enableCompression 等）

### 关键设计
- 加密/压缩失败时降级为原始数据上传
- 磁盘文件格式带 MAGIC + VERSION + CRC32 校验
- HttpTransport 在独立线程执行，回调通知 LogBatcher 删除已上传日志

### 验收标准
```bash
cd example && npm run android
# 触发日志后，adb shell 查看 /data/data/com.rnlogs/cache/rnlogs/queue.dat 存在
# 网络抓包或服务端日志确认 HTTP 请求到达
# 压缩/加密开关可在 config 中控制
```

---

## Phase 4: 崩溃报告 + 生产级打磨

**目标**：实现崩溃捕获与上报、Protobuf 序列化、gRPC 后端对接、性能优化。

### 核心任务
1. **崩溃处理（平台相关）**
   - Android: `CrashHandlerAndroid.cpp` — signal handler (SIGSEGV, SIGABRT 等)
   - iOS: `CrashHandlerIOS.mm` — PLCrashReporter 集成
   - `BreadcrumbTracker` — 维护最近 N 条面包屑，崩溃时持久化
   - `CrashReporter` — 生成崩溃报告，下次启动检查并上报
2. **Protobuf 序列化（可选升级）**
   - `proto/log_event.proto` / `batch.proto` 定义
   - 用 `protoc` 生成 C++ 代码
   - `LogSerializer` 升级为 Protobuf 格式
3. **gRPC 后端对接**
   - `backend/proto/api.proto` 服务定义
   - C++ 层 gRPC client 或 HTTPS + Protobuf body
4. **性能优化**
   - 内存池优化（减少频繁的 JSON string 分配）
   - 批量压缩/加密（减少 zlib 上下文切换）
   - 启动时异步恢复磁盘队列（不阻塞主线程）
5. **测试与 CI**
   - Jest 单元测试（JS 层收集器、队列逻辑）
   - C++ GoogleTest（序列化、压缩加密正确性）
   - Android Instrumented Test（端到端）

### 关键设计
- 崩溃报告作为特殊 `LogEvent`（`type: "crash"`, `level: "fatal"`）进入正常队列
- Protobuf 升级保持向后兼容（先用字段号预留）
- iOS 端 CocoaPods 依赖 `PLCrashReporter`

### 验收标准
```bash
cd packages/sdk && npm run test          # Jest 通过
cd packages/sdk && npm run build         # builder-bob 打包通过
cd example && npm run android            # 端到端运行
# 触发 Native crash（如故意空指针），确认崩溃文件生成并上报
```

---

## 文件清单（按阶段新建/修改）

| 文件 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| `src/RNLogsModule.ts` | ✅ 新建 | 🔄 接入 Native | 🔄 无改动 | 🔄 无改动 |
| `src/core/LogQueue.ts` | ✅ 新建 | 🔄 无改动 | 🔄 无改动 | 🔄 无改动 |
| `src/core/LogBatcher.ts` | ✅ 新建 | 🔄 接入 Native | 🔄 无改动 | 🔄 无改动 |
| `src/collectors/*.ts` | ✅ 新建 | 🔄 无改动 | 🔄 无改动 | 🔄 无改动 |
| `src/specs/NativeRNLogs.ts` | — | ✅ 新建 | 🔄 无改动 | 🔄 无改动 |
| `cpp/jsi/RNLogsJSIBinding.cpp` | — | ✅ 新建 | 🔄 完善方法 | 🔄 无改动 |
| `cpp/core/LogQueue.cpp` | — | ✅ 空实现 | 🔄 加持久化 | 🔄 无改动 |
| `cpp/core/LogBatcher.cpp` | — | — | ✅ 新建 | 🔄 无改动 |
| `cpp/core/LogSerializer.cpp` | — | — | ✅ 新建 | 🔄 升 Protobuf |
| `cpp/utils/Compression.cpp` | — | — | ✅ 新建 | 🔄 无改动 |
| `cpp/utils/Crypto.cpp` | — | — | ✅ 新建 | 🔄 无改动 |
| `cpp/transport/HttpTransport.cpp` | — | — | ✅ 新建 | 🔄 无改动 |
| `android/jni/OnLoad.cpp` | — | ✅ 新建 | 🔄 无改动 | 🔄 无改动 |
| `android/jni/CrashHandlerAndroid.cpp` | — | — | — | ✅ 新建 |
| `android/CMakeLists.txt` | — | ✅ 新建 | 🔄 加链接库 | 🔄 无改动 |
| `android/.../RNLogsModule.kt` | — | ✅ 新建 | 🔄 无改动 | 🔄 无改动 |
| `proto/*.proto` | — | — | — | ✅ 新建/升级 |
| `ios/RNLogs.mm` / `.podspec` | — | — | — | ✅ 新建 |
| `__tests__/*.test.ts` | — | — | — | ✅ 新建 |

---

## 建议的下一步

如果你同意这个路线图，我们可以从 **Phase 1** 开始：

1. 先清理当前项目中未完成的 Native 代码（暂时移出或注释）
2. 确保 example 应用能独立运行（纯 RN 0.83.1）
3. 实现 Phase 1 的纯 JS 层 SDK + example 集成
4. 验证通过后进入 Phase 2

每个阶段完成后，都会有一个 **可编译、可运行、可验证** 的里程碑，避免一次性引入过多复杂度。
