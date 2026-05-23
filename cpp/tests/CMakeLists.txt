cmake_minimum_required(VERSION 3.10)
project(RNLogsCppTests)

set(CMAKE_CXX_STANDARD 17)

set(SOURCE_FILES
    run_tests.cpp
    ../core/LogSerializer.cpp
    ../core/BreadcrumbTracker.cpp
    ../core/CrashReporter.cpp
    ../core/LogQueue.cpp
    ../utils/Compression.cpp
    ../utils/Crypto.cpp
)

add_executable(run_tests ${SOURCE_FILES})

# 链接系统的 zlib 库
find_package(ZLIB REQUIRED)
target_link_libraries(run_tests PRIVATE ZLIB::ZLIB)

# 头文件目录挂载
target_include_directories(run_tests PRIVATE
    ../core
    ../jsi
    ../utils
)
