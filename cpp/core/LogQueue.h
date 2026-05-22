#pragma once
#include <string>
#include <vector>
#include <mutex>

class LogQueue {
public:
    LogQueue(size_t maxSize = 1000);
    void push(const std::string& log);
    std::vector<std::string> dequeue(size_t count);
    size_t size();
    void clear();

private:
    size_t maxSize_;
    std::vector<std::string> queue_;
    std::mutex mutex_;
};
