# React Native 新架构 (Bridgeless 模式) 下 JSI 挂载失败排查与修复总结

在将高性能日志采集 SDK `react-native-rnlogs` 独立封装为本地库（Packages）后，React Native 0.83+ 新架构的 **Bridgeless 模式**下出现 `JSI 注入状态：未挂载` 的问题。本文档对该问题的现象、深层根源及最终的终极解决方案进行总结。

---

## 1. 问题现象
* **JS 侧**：获取的原生模块 `RNLogsNativeModule` 为 `undefined`，无法调用 `install()`。
* **原生侧**：JSI 绑定代码未能被加载，C++ 层的 `global.__rnlogsInternal` Host Object 无法注入到 JS 全局环境中。
* **编译侧**：在添加对 JSI 的 C++ 依赖后，库在 Android 端的 NDK 编译出现 `jsi/jsi.h` 头文件缺失、STL 链接冲突及主应用专属 JNI 逻辑冲突等一系列编译错误。

---

## 2. 根本原因剖析

### 2.1 类发现与自动链接限制 (Lazy Loading)
在新架构 Bridgeless 模式下，React Native 引入了严格的延迟加载（Lazy Loading）机制。
* **问题**：如果封装的本地原生库没有在 Android Java/Kotlin 类上添加 `@ReactModule` 注解，React Native 在启动预扫描时就无法获取该模块的信息，因此在 JS 全局的 `NativeModules` 中不会将其暴露，JS 端获取到的是 `undefined`。
* **对比**：在封装前，模块属于主 App 内部，其初始化和加载直接受主 App 原生生命周期接管，不依赖 CLI 自动链接扫描。

### 2.2 传统 Bridge 获取 Runtime 的机制失效
在 Bridgeless 模式下，传统的 Bridge 实例被彻底废弃。
* **Android 端**：原本通过 `reactApplicationContext.catalystInstance?.javaScriptContextHolder` 获取 Runtime 句柄，但在新架构下 `catalystInstance` 直接返回 `null`。
* **iOS 端**：没有全局 Bridge 实例，`self.bridge` 返回 `nil`，导致之前通过强转获取 Runtime 句柄的链路中断。

### 2.3 第三方原生 C++ 编译与链接冲突
1. **找不到 JSI 头文件**：因为未在库的 `CMakeLists.txt` 中发现并链接 React Native 底层分发的 AAR C++ 包。
2. **`minSdkVersion` 不匹配**：React Native 0.83 的 AAR 预编译库使用的是 `minSdkVersion 24`，而本地库默认声明的是 `minSdkVersion 21`，导致 CMake 链接失败。
3. **C++ STL 冲突**：React Native 新架构在 Android 上采用共享的 STL (`c++_shared`)，而第三方库默认采用静态 STL，导致链接阶段因 STL 格式不一致被拒。
4. **主应用 JNI 模板遗留**：封装原生库的 JNI 启动文件 `OnLoad.cpp` 错误包含了主应用的 `DefaultComponentsRegistry` 及 `autolinking` 注册代码，导致在没有对应生成类的第三方库编译中报错。

---

## 3. 终极解决方案

### 3.1 解决类自动链接发现与 Runtime 获取
* **Android 侧**：
  1. 在 `RNLogsModule.kt` 上追加 `@ReactModule(name = "RNLogsModule")` 注解。
  2. 修改 `install` 方法，去除对 `catalystInstance` 的访问，改用直接安全的 `reactApplicationContext.javaScriptContextHolder`。
* **iOS 侧**：
  1. 引入 `<ReactCommon/RCTTurboModuleWithJSIBindings.h>`，声明类遵守 `RCTTurboModuleWithJSIBindings` 协议。
  2. 实现其新架构生命周期方法 `-installJSIBindingsWithRuntime:callInvoker:`。React Native 底层在初始化 JS 引擎时会自动调用该方法，将底层的 `jsi::Runtime &` 传递给该库进行注入，彻底摆脱了对 Bridge 实例的依赖。

### 3.2 解决 NDK 编译与 JNI 冲突
1. **C++ 跨平台日志兼容**：使用 `#ifdef __ANDROID__` 编译宏隔离 iOS 下不存在的 `<android/log.h>` 头文件和 `__android_log_print` 函数，防范 iOS 端编译失败。
2. **CMake 引入 React Native Prefab**：
   在 `CMakeLists.txt` 中通过 `find_package(ReactAndroid REQUIRED)` 引入 AAR 中的 Prefab 依赖，并将其链接至库本身：
   ```cmake
   find_package(ReactAndroid REQUIRED)
   target_link_libraries(
       react-native-rnlogs
       ReactAndroid::jsi
       log
       z
   )
   ```
3. **更新 build.gradle**：
   在库的 `build.gradle` 中启用 `buildFeatures { prefab true }`，设置 `minSdkVersion 24`，并设定 CMake 编译参数使用共享的 STL：
   ```groovy
   android {
       buildFeatures {
           prefab true
       }
       defaultConfig {
           minSdkVersion 24
           externalNativeBuild {
               cmake {
                   arguments "-DANDROID_STL=c++_shared"
               }
           }
       }
   }
   ```
4. **精炼 JNI 逻辑**：
   在 `OnLoad.cpp` 中彻底移除与第三方原生库不相干的主 App JNI 映射代码，将 `JNI_OnLoad` 简化为只返回标准的 `JNI_VERSION_1_6`。同时将相对路径 include 替换为直接引入，规避符号链接（symlinks）的路径解析失败。

---

## 4. 总结与意义
本次修复建立了**标准、现代的 React Native 新架构原生库兼容范式**。解决了第三方原生库因新架构 (Bridgeless) 和 Lazy Loading 机制带来的双端 Runtime 挂载难题，完成了 JSI 通道在封装独立库情况下的微秒级同步写入打通，保障了双端编译与运行的稳定性。
