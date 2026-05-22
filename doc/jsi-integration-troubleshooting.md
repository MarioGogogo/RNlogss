# JSI 桥接阶段编译与运行时崩溃排查修复文档

在实现 **Phase 2: TurboModule + JSI 桥接（打通 JS → C++）** 过程中，Android 端在编译期与运行期分别遇到了两个阻塞性问题。本文档总结了这两个问题的现象、根源剖析及最终的解决方案，以供后续维护与新架构迁移参考。

---

## 1. 编译期错误：CMake 无法找到 JSI 绑定源文件

### 1.1 问题现象
在执行原生构建（`npm run android` 或 `./gradlew assembleDebug`）时，CMake 配置阶段报错：
```text
> Task :app:configureCMakeDebug[arm64-v8a] FAILED
C/C++: CMake Error at /Users/lovewcc/Documents/Me/ReactNative/RNlogss/node_modules/react-native/ReactAndroid/cmake-utils/ReactNative-application.cmake:64 (add_library):
C/C++:   Cannot find source file:
C/C++:     ../../../../cpp/jsi/RNLogsJSIBinding.cpp
C/C++: Call Stack (most recent call first):
C/C++:   CMakeLists.txt:8 (include)
C/C++: CMake Generate step failed.  Build files cannot be regenerated correctly.
```

### 1.2 根源剖析
我们在 [CMakeLists.txt](file:///Users/lovewcc/Documents/Me/ReactNative/RNlogss/android/app/src/main/jni/CMakeLists.txt) 中已将源文件路径从旧的 4 级回退更正为了 5 级（`${CMAKE_CURRENT_SOURCE_DIR}/../../../../../cpp/jsi/RNLogsJSIBinding.cpp`）。

然而，由于 CMake 的构建系统在本地生成了 `.cxx` 缓存文件（位于 `android/app/.cxx`），即使修改了配置，CMake 的重新配置（Configure）机制也没有完全使之前的相对路径失效，依然固执地在 `arm64-v8a` 编译中寻找错误的 4 级相对路径。

### 1.3 解决方案
必须手动强制清理 CMake 本地编译缓存，并执行 Gradle 的 Clean 任务：
```bash
# 1. 移除 android/app/.cxx 本地缓存目录
rm -rf android/app/.cxx

# 2. 进入 android 目录清理生成物
cd android
./gradlew clean
```
清理后，再次运行构建命令，CMake 便会以最新的 5 级绝对路径（通过 `${CMAKE_CURRENT_SOURCE_DIR}` 展开）顺利完成源码解析和编译。

---

## 2. 运行期错误：宿主启动崩溃 `'PlatformConstants' could not be found`

### 2.1 问题现象
应用编译打包成功并安装后，启动即闪退。检索系统日志 `adb logcat` 会发现以下致命崩溃堆栈：
```text
com.facebook.react.common.JavascriptException: [runtime not ready]: Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be found. Verify that a module by this name is registered in the native binary.
	at com.facebook.react.modules.core.ExceptionsManagerModule.reportException(ExceptionsManagerModule.kt:52)
	at com.facebook.react.runtime.ReactInstance$ReactJsExceptionHandlerImpl.reportJsException(ReactInstance.kt:291)
	...
```

### 2.2 根源剖析
在 React Native 新架构（Bridgeless 模式，RN 0.83+）中，React 核心库自身带有大量的内置原生 C++ TurboModules（例如 `PlatformConstants`、`Timing`、`DeviceEventManager` 等）。

为了挂载我们的自定义 JSI 同步通道，我们在 [OnLoad.cpp](file:///Users/lovewcc/Documents/Me/ReactNative/RNlogss/android/app/src/main/jni/OnLoad.cpp) 中实现了自定义的 `JNI_OnLoad` 函数，并指定了自定义的 `javaModuleProvider`：
```cpp
// 错误的旧实现
std::shared_ptr<TurboModule> javaModuleProvider(const std::string &name, const JavaTurboModule::InitParams &params) {
  return autolinking_ModuleProvider(name, params);
}
```
这导致当宿主 App 加载 `appmodules` 库后，全局的 `javaModuleProvider` 指针被改写，**且仅仅 fallback 到了 `autolinking_ModuleProvider`（即自动链接的第三方模块中）**。
由于 `autolinking_ModuleProvider` 中并不包含 React Native 的核心原生库，因此当 React Native 引擎内部查询 `PlatformConstants` 核心组件时，我们的提供者直接返回了 `nullptr`，导致核心组件无法加载，引擎初始化失败而崩溃。

### 2.3 解决方案
参考 React Native 官方模板配置，必须在自定义的 `javaModuleProvider` 链中**优先对核心模块进行拦截并注册**。

修改 [OnLoad.cpp](file:///Users/lovewcc/Documents/Me/ReactNative/RNlogss/android/app/src/main/jni/OnLoad.cpp) 代码：
1. 引入核心模块提供者头文件 `<FBReactNativeSpec.h>`；
2. 在 `javaModuleProvider` 中先通过 `FBReactNativeSpec_ModuleProvider` 匹配核心模块，若非核心模块再向下 fallback 至 `autolinking_ModuleProvider`。

核心修复代码对比：
```diff
+#include <FBReactNativeSpec.h>
+
 #include "../../../../../cpp/jsi/RNLogsJSIBinding.h"
 
 namespace facebook::react {
@@ -17,6 +17,9 @@
 }
 
 std::shared_ptr<TurboModule> javaModuleProvider(const std::string &name, const JavaTurboModule::InitParams &params) {
+  if (auto module = FBReactNativeSpec_ModuleProvider(name, params)) {
+    return module;
+  }
   return autolinking_ModuleProvider(name, params);
 }
```

---

## 3. 最终验证与运行状态

修复以上问题并重新编译安装后，应用启动完美运行，无任何闪退。

### 3.1 原生日志输出
在 `adb logcat` 中过滤 `JSI` 和 `ReactNativeJS`，可验证如下成功日志：
```text
I RNLogsJSI: RNLogsJSIBinding::install called
I RNLogsJSI: RNLogsJSIBinding: registered __rnlogsInternal into JS global
I ReactNativeJS: '[RNLogs] JSI installation result:', true
```
证实 `__rnlogsInternal` 全局桥接对象已经无缝注入到 JavaScript 运行时（Hermes 引擎）。

### 3.2 交互验证
1. 打开应用程序并进入 **Tab 2: Phase 2** 面板。
2. 观察到 `JSI Status` 显示为 **已挂载**。
3. 点击测试面板的交互动作（如 `Single Push` 或 `Pressure Test`），`Queue Size` 监视器数值可以根据 C++ 侧 `LogQueue` 的环形队列大小同步毫秒级更新，证明了 JS → C++ JSI 通道完全被打通。
