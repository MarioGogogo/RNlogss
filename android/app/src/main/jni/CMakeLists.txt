cmake_minimum_required(VERSION 3.22.1)

project(appmodules)

set(CMAKE_CXX_STANDARD 17)

# 引入 React Native 官方的新架构构建助手配置
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# 将自定义的 C++ 和 JSI 绑定代码文件追加编译到宿主的 appmodules 共享库中
target_sources(
    appmodules
    PRIVATE
    OnLoad.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../cpp/jsi/RNLogsJSIBinding.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../cpp/core/LogQueue.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../cpp/utils/Compression.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../cpp/utils/Crypto.cpp
)

# 挂载头文件包含目录
target_include_directories(
    appmodules
    PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../cpp/jsi
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../cpp/core
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../cpp/utils
)

# 链接日志库
target_link_libraries(
    appmodules
    log
)
