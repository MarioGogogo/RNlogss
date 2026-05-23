#pragma once
#include <string>

namespace rnlogs {

class CrashReporter {
public:
    static CrashReporter& getInstance();

    // 初始化缓存目录
    void initialize(const std::string& cacheDir);

    // 下次启动检测是否存在挂起的崩溃报告
    bool hasPendingCrashReport() const;

    // 读取并销毁挂起的崩溃报告，返回 JSON 字符串
    std::string consumeCrashReport();

    // 信号安全的崩溃转储：在信号处理器中直接通过系统调用写入磁盘文件
    void writeCrashReportFromSignal(const char* signalName, const char* errorMsg);

private:
    CrashReporter() = default;
    ~CrashReporter() = default;
    CrashReporter(const CrashReporter&) = delete;
    CrashReporter& operator=(const CrashReporter&) = delete;

    std::string cacheDir_;
    std::string getCrashFilePath() const;
};

} // namespace rnlogs
