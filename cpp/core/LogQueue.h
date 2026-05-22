#pragma once
#include <string>
#include <vector>
#include <mutex>
#include <map>

class LogQueue {
public:
    LogQueue(size_t maxSize = 1000);
    void push(const std::string& log);
    std::vector<std::string> dequeue(size_t count);
    size_t size();
    void clear();

    // Phase 3：磁盘持久化管理接口
    void setCacheDir(const std::string& cacheDir);
    void setBatchSize(size_t batchSize);
    void persistMemoryQueue();
    std::pair<std::string, std::string> fetchNextBatch();
    void confirmBatch(const std::string& batchId, bool success);

private:
    void persistMemoryQueueToDiskWithLock();

    size_t maxSize_;
    size_t batchSize_;
    std::string cacheDir_;
    std::vector<std::string> queue_;
    std::map<std::string, std::string> pendingUploads_; // batchId -> filePath
    std::mutex mutex_;
};
