#pragma once
#include <string>
#include <vector>
#include <atomic>
#include <cstdint>

namespace rnlogs {

struct Breadcrumb {
    uint64_t timestamp;
    char category[64];
    char message[256];
    bool valid;
};

class BreadcrumbTracker {
public:
    static BreadcrumbTracker& getInstance();

    // 写入一条面包屑
    void addBreadcrumb(const std::string& message, const std::string& category = "default");

    // 获取当前保存的面包屑列表 (普通业务上报使用，返回 std::string 列表)
    std::vector<std::string> getBreadcrumbsJson() const;

    // 信号安全读取：在 Crash Handler 信号处理函数中直接写入 fd
    // 规避使用 std::string/std::vector 等堆内存分配
    void writeBreadcrumbsToFd(int fd) const;

    // 重置面包屑队列
    void clear();

private:
    BreadcrumbTracker();
    ~BreadcrumbTracker() = default;
    BreadcrumbTracker(const BreadcrumbTracker&) = delete;
    BreadcrumbTracker& operator=(const BreadcrumbTracker&) = delete;

    static constexpr size_t MAX_BREADCRUMBS = 30;
    Breadcrumb buffer_[MAX_BREADCRUMBS];
    std::atomic<size_t> writeIndex_{0};
};

} // namespace rnlogs
