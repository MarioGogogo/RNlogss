#include "BreadcrumbTracker.h"
#include <chrono>
#include <cstring>
#include <algorithm>
#include <unistd.h>

namespace rnlogs {

namespace {
// 信号安全的 uint64 转十进制字符串函数
void uint64ToString(uint64_t val, char* outBuf, size_t& len) {
    if (val == 0) {
        outBuf[0] = '0';
        outBuf[1] = '\0';
        len = 1;
        return;
    }
    char tmp[24];
    size_t i = 0;
    while (val > 0) {
        tmp[i++] = '0' + (val % 10);
        val /= 10;
    }
    len = i;
    for (size_t j = 0; j < i; ++j) {
        outBuf[j] = tmp[i - 1 - j];
    }
    outBuf[i] = '\0';
}

// 信号安全的字符串写入辅助函数
void safeWriteStr(int fd, const char* str) {
    if (str) {
        write(fd, str, strlen(str));
    }
}
}

BreadcrumbTracker& BreadcrumbTracker::getInstance() {
    static BreadcrumbTracker instance;
    return instance;
}

BreadcrumbTracker::BreadcrumbTracker() {
    clear();
}

void BreadcrumbTracker::clear() {
    for (size_t i = 0; i < MAX_BREADCRUMBS; ++i) {
        buffer_[i].timestamp = 0;
        buffer_[i].category[0] = '\0';
        buffer_[i].message[0] = '\0';
        buffer_[i].valid = false;
    }
    writeIndex_.store(0, std::memory_order_relaxed);
}

void BreadcrumbTracker::addBreadcrumb(const std::string& message, const std::string& category) {
    auto now = std::chrono::system_clock::now().time_since_epoch();
    uint64_t ms = std::chrono::duration_cast<std::chrono::milliseconds>(now).count();

    size_t idx = writeIndex_.fetch_add(1, std::memory_order_relaxed) % MAX_BREADCRUMBS;

    // 复制数据
    buffer_[idx].timestamp = ms;
    
    // 拷贝消息，限制长度以防截断
    size_t catLen = std::min(category.length(), sizeof(buffer_[idx].category) - 1);
    memcpy(buffer_[idx].category, category.c_str(), catLen);
    buffer_[idx].category[catLen] = '\0';

    size_t msgLen = std::min(message.length(), sizeof(buffer_[idx].message) - 1);
    memcpy(buffer_[idx].message, message.c_str(), msgLen);
    buffer_[idx].message[msgLen] = '\0';

    buffer_[idx].valid = true;
}

std::vector<std::string> BreadcrumbTracker::getBreadcrumbsJson() const {
    std::vector<Breadcrumb> temp;
    for (size_t i = 0; i < MAX_BREADCRUMBS; ++i) {
        if (buffer_[i].valid) {
            temp.push_back(buffer_[i]);
        }
    }

    // 按时间戳从旧到新排序
    std::sort(temp.begin(), temp.end(), [](const Breadcrumb& a, const Breadcrumb& b) {
        return a.timestamp < b.timestamp;
    });

    std::vector<std::string> result;
    for (const auto& bc : temp) {
        std::string json = "{\"timestamp\":" + std::to_string(bc.timestamp) +
                           ",\"category\":\"" + bc.category +
                           "\",\"message\":\"" + bc.message + "\"}";
        result.push_back(json);
    }
    return result;
}

void BreadcrumbTracker::writeBreadcrumbsToFd(int fd) const {
    // 收集有效的面包屑
    struct IndexedBreadcrumb {
        const Breadcrumb* ptr;
        uint64_t ts;
    };
    IndexedBreadcrumb temp[MAX_BREADCRUMBS];
    size_t validCount = 0;

    for (size_t i = 0; i < MAX_BREADCRUMBS; ++i) {
        if (buffer_[i].valid) {
            temp[validCount].ptr = &buffer_[i];
            temp[validCount].ts = buffer_[i].timestamp;
            validCount++;
        }
    }

    // 在不使用 std::sort (这可能涉及 std::allocator 分配) 的情况下进行简单的插入排序
    for (size_t i = 1; i < validCount; ++i) {
        IndexedBreadcrumb key = temp[i];
        int j = (int)i - 1;
        while (j >= 0 && temp[j].ts > key.ts) {
            temp[j + 1] = temp[j];
            j--;
        }
        temp[j + 1] = key;
    }

    // 拼装 JSON 数组
    safeWriteStr(fd, "[");
    for (size_t i = 0; i < validCount; ++i) {
        if (i > 0) {
            safeWriteStr(fd, ",");
        }
        safeWriteStr(fd, "{\"timestamp\":");
        char tsStr[24];
        size_t tsLen = 0;
        uint64ToString(temp[i].ts, tsStr, tsLen);
        write(fd, tsStr, tsLen);

        safeWriteStr(fd, ",\"category\":\"");
        safeWriteStr(fd, temp[i].ptr->category);

        safeWriteStr(fd, "\",\"message\":\"");
        safeWriteStr(fd, temp[i].ptr->message);
        safeWriteStr(fd, "\"}");
    }
    safeWriteStr(fd, "]");
}

} // namespace rnlogs
