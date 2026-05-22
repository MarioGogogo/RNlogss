#include "LogQueue.h"

LogQueue::LogQueue(size_t maxSize) : maxSize_(maxSize) {}

void LogQueue::push(const std::string& log) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (queue_.size() >= maxSize_) {
        // 丢弃最旧的日志
        queue_.erase(queue_.begin());
    }
    queue_.push_back(log);
}

std::vector<std::string> LogQueue::dequeue(size_t count) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> result;
    size_t actualCount = std::min(count, queue_.size());
    result.assign(queue_.begin(), queue_.begin() + actualCount);
    queue_.erase(queue_.begin(), queue_.begin() + actualCount);
    return result;
}

size_t LogQueue::size() {
    std::lock_guard<std::mutex> lock(mutex_);
    return queue_.size();
}

void LogQueue::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.clear();
}
