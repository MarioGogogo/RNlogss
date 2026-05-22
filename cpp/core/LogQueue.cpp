#include "LogQueue.h"
#include <fstream>
#include <filesystem>
#include <chrono>
#include <algorithm>
#include <cstdlib>

namespace fs = std::filesystem;

LogQueue::LogQueue(size_t maxSize) 
    : maxSize_(maxSize), batchSize_(50), cacheDir_("") {}

void LogQueue::push(const std::string& log) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (queue_.size() >= maxSize_) {
        // 丢弃内存中最旧的日志
        queue_.erase(queue_.begin());
    }
    queue_.push_back(log);

    // 内存队列达到批次大小，强制执行落盘
    if (queue_.size() >= batchSize_) {
        persistMemoryQueueToDiskWithLock();
    }
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
    size_t total = queue_.size();
    // 包含未确认的磁盘文件所对应的估计数量
    if (!cacheDir_.empty()) {
        try {
            for (const auto& entry : fs::directory_iterator(cacheDir_)) {
                if (entry.is_regular_file()) {
                    std::string name = entry.path().filename().string();
                    if (name.rfind("log_", 0) == 0 && name.rfind(".dat") == name.length() - 4) {
                        // 磁盘上的每一块约等于一个批次的大小，累加
                        total += batchSize_;
                    }
                }
            }
        } catch (...) {}
    }
    return total;
}

void LogQueue::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.clear();
    if (!cacheDir_.empty()) {
        try {
            for (const auto& entry : fs::directory_iterator(cacheDir_)) {
                if (entry.is_regular_file()) {
                    std::string name = entry.path().filename().string();
                    if (name.rfind("log_", 0) == 0 && name.rfind(".dat") == name.length() - 4) {
                        fs::remove(entry.path());
                    }
                }
            }
        } catch (...) {}
    }
    pendingUploads_.clear();
}

void LogQueue::setCacheDir(const std::string& cacheDir) {
    std::lock_guard<std::mutex> lock(mutex_);
    cacheDir_ = cacheDir;
    try {
        if (!cacheDir_.empty() && !fs::exists(cacheDir_)) {
            fs::create_directories(cacheDir_);
        }
    } catch (...) {}
}

void LogQueue::setBatchSize(size_t batchSize) {
    std::lock_guard<std::mutex> lock(mutex_);
    batchSize_ = batchSize;
}

void LogQueue::persistMemoryQueue() {
    std::lock_guard<std::mutex> lock(mutex_);
    persistMemoryQueueToDiskWithLock();
}

void LogQueue::persistMemoryQueueToDiskWithLock() {
    if (queue_.empty() || cacheDir_.empty()) {
        return;
    }
    try {
        auto now = std::chrono::system_clock::now().time_since_epoch().count();
        // 增加随机数防止文件名碰撞
        std::string fileName = "log_" + std::to_string(now) + "_" + std::to_string(rand() % 1000) + ".dat";
        std::string filePath = cacheDir_ + "/" + fileName;

        std::ofstream out(filePath, std::ios::out | std::ios::trunc);
        if (out.is_open()) {
            for (const auto& log : queue_) {
                out << log << "\n";
            }
            out.close();
            queue_.clear();
        }
    } catch (...) {}
}

std::pair<std::string, std::string> LogQueue::fetchNextBatch() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (cacheDir_.empty()) {
        return {"", ""};
    }

    std::vector<std::string> files;
    auto scanFiles = [this, &files]() {
        files.clear();
        try {
            for (const auto& entry : fs::directory_iterator(cacheDir_)) {
                if (entry.is_regular_file()) {
                    std::string name = entry.path().filename().string();
                    if (name.rfind("log_", 0) == 0 && name.rfind(".dat") == name.length() - 4) {
                        if (pendingUploads_.find(name) == pendingUploads_.end()) {
                            files.push_back(name);
                        }
                    }
                }
            }
        } catch (...) {}
    };

    scanFiles();

    // 如果磁盘上没有准备好上传的日志块，但内存里有数据，则强行写入磁盘并重新扫描
    if (files.empty() && !queue_.empty()) {
        persistMemoryQueueToDiskWithLock();
        scanFiles();
    }

    if (files.empty()) {
        return {"", ""};
    }

    // 按时间顺序对文件名进行排序，保证先进先出（FIFO）
    std::sort(files.begin(), files.end());
    std::string targetFileName = files[0];
    std::string targetFilePath = cacheDir_ + "/" + targetFileName;

    std::ifstream in(targetFilePath);
    std::string content = "";
    if (in.is_open()) {
        std::string line;
        content = "[";
        bool first = true;
        while (std::getline(in, line)) {
            if (!line.empty()) {
                if (!first) {
                    content += ",";
                }
                content += line;
                first = false;
            }
        }
        content += "]";
        in.close();

        // 记录正在上传的批次文件
        pendingUploads_[targetFileName] = targetFilePath;
        return {targetFileName, content};
    }

    return {"", ""};
}

void LogQueue::confirmBatch(const std::string& batchId, bool success) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = pendingUploads_.find(batchId);
    if (it != pendingUploads_.end()) {
        std::string filePath = it->second;
        if (success) {
            try {
                fs::remove(filePath);
            } catch (...) {}
        }
        pendingUploads_.erase(it);
    }
}
