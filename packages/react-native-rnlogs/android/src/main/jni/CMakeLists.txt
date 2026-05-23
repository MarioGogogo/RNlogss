cmake_minimum_required(VERSION 3.22.1)

project(react-native-rnlogs)

set(CMAKE_CXX_STANDARD 17)

# 编译 C++ 源码到 react-native-rnlogs 共享库中
add_library(
    react-native-rnlogs
    SHARED
    OnLoad.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/jsi/RNLogsJSIBinding.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/core/LogQueue.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/core/BreadcrumbTracker.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/core/CrashReporter.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/core/CrashHandlerAndroid.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/core/LogSerializer.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/utils/Compression.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/utils/Crypto.cpp
)

# 挂载头文件包含目录
target_include_directories(
    react-native-rnlogs
    PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/jsi
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/core
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/utils
)

# 链接日志库与 zlib
target_link_libraries(
    react-native-rnlogs
    log
    z
)
