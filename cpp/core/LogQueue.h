#pragma once
#include <string>
#include <vector>
#include <mutex>
#include <map>
#include <string_view>
#include <atomic>
#include "ArenaAllocator.h"

class LogQueue {
public:
    LogQueue(size_t maxSize = 1000);
    ~LogQueue() = default;

    void push(const std::string& log);
    std::vector<std::string> dequeue(size_t count);
    size_t size();
    void clear();

    void setCacheDir(const std::string& cacheDir);
    void setBatchSize(size_t batchSize);
    void persistMemoryQueue();
    std::pair<std::string, std::string> fetchNextBatch();
    void confirmBatch(const std::string& batchId, bool success);
    void writeQueueToFd(int fd);

private:
    void persistMemoryQueueToDiskWithLock();
    void scanDiskFilesAsync(); // 异步启动扫描磁盘文件

    size_t maxSize_;
    size_t batchSize_;
    std::string cacheDir_;
    
    // 使用 Arena 优化频繁的日志字符串堆内存分配
    rnlogs::ArenaAllocator arena_;
    std::vector<std::string_view> queue_;
    
    std::map<std::string, std::string> pendingUploads_; // batchId -> filePath
    
    std::mutex mutex_;
    std::atomic<bool> isScanning_{false};
    std::vector<std::string> diskFilesList_; // 已扫描的磁盘文件列表，保证 FIFO 排序
};
