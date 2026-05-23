#include "LogQueue.h"
#include "Compression.h"
#include "Crypto.h"
#include <fstream>
#include <filesystem>
#include <chrono>
#include <algorithm>
#include <cstdlib>
#include <thread>
#include <unistd.h>

namespace fs = std::filesystem;

LogQueue::LogQueue(size_t maxSize) 
    : maxSize_(maxSize), batchSize_(50), cacheDir_(""), arena_(1024 * 1024) {}

void LogQueue::push(const std::string& log) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (queue_.size() >= maxSize_) {
        // 丢弃内存中最旧的日志
        queue_.erase(queue_.begin());
    }
    
    // 拷贝至内存池中，避免小 string 频繁分配堆内存
    std::string_view saved = arena_.allocateString(log);
    if (!saved.empty()) {
        queue_.push_back(saved);
    }

    // 内存队列达到批次大小，强行落盘并重置 Arena
    if (queue_.size() >= batchSize_) {
        persistMemoryQueueToDiskWithLock();
    }
}

std::vector<std::string> LogQueue::dequeue(size_t count) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> result;
    size_t actualCount = std::min(count, queue_.size());
    for (size_t i = 0; i < actualCount; ++i) {
        result.push_back(std::string(queue_[i]));
    }
    queue_.erase(queue_.begin(), queue_.begin() + actualCount);
    if (queue_.empty()) {
        arena_.reset(); // 清空后重置内存池以复用空间
    }
    return result;
}

size_t LogQueue::size() {
    std::lock_guard<std::mutex> lock(mutex_);
    size_t total = queue_.size();
    // 近似折算：每个磁盘文件估算为 1 个批次大小
    total += diskFilesList_.size() * batchSize_;
    return total;
}

void LogQueue::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.clear();
    arena_.reset();
    
    if (!cacheDir_.empty()) {
        for (const auto& name : diskFilesList_) {
            try {
                fs::remove(cacheDir_ + "/" + name);
            } catch (...) {}
        }
        for (const auto& pair : pendingUploads_) {
            try {
                fs::remove(pair.second);
            } catch (...) {}
        }
    }
    diskFilesList_.clear();
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
    
    // 异步启动磁盘历史文件整理，绝不阻塞 JSI 初始化与主线程启动
    isScanning_ = true;
    std::thread([this]() {
        scanDiskFilesAsync();
    }).detach();
}

void LogQueue::scanDiskFilesAsync() {
    std::vector<std::string> tempFiles;
    std::string path;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        path = cacheDir_;
    }
    if (path.empty()) {
        isScanning_ = false;
        return;
    }
    try {
        for (const auto& entry : fs::directory_iterator(path)) {
            if (entry.is_regular_file()) {
                std::string name = entry.path().filename().string();
                // 筛选我们格式的历史日志包
                if (name.rfind("log_", 0) == 0 && name.rfind(".dat") == name.length() - 4) {
                    tempFiles.push_back(name);
                }
            }
        }
        // 按名称（含时间戳）升序排列，支持 FIFO 顺序恢复
        std::sort(tempFiles.begin(), tempFiles.end());
    } catch (...) {}

    std::lock_guard<std::mutex> lock(mutex_);
    diskFilesList_ = std::move(tempFiles);
    isScanning_ = false;
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
        // 1. 合并为一个由 '\n' 分隔的长文本（批量模式）
        std::string joinedLogs;
        for (const auto& log : queue_) {
            joinedLogs.append(log);
            joinedLogs.push_back('\n');
        }

        // 2. 批量进行 zlib Gzip 压缩，实现高压缩比
        std::string compressed = utils::Compression::gzipCompress(joinedLogs);

        // 3. 对压缩块进行自包含的 AES-256 加密落盘以保证本地安全
        std::string encrypted = utils::Crypto::encryptAesGcm(compressed, "RNlogsSecureSaltKey_2026");

        auto now = std::chrono::system_clock::now().time_since_epoch().count();
        std::string fileName = "log_" + std::to_string(now) + "_" + std::to_string(rand() % 1000) + ".dat";
        std::string filePath = cacheDir_ + "/" + fileName;

        std::ofstream out(filePath, std::ios::out | std::ios::trunc | std::ios::binary);
        if (out.is_open()) {
            out.write(encrypted.data(), encrypted.length());
            out.close();
            
            diskFilesList_.push_back(fileName);
            queue_.clear();
            arena_.reset(); // 落盘后重置 Arena 内存池
        }
    } catch (...) {}
}

std::pair<std::string, std::string> LogQueue::fetchNextBatch() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (cacheDir_.empty() || isScanning_) {
        return {"", ""};
    }

    // 磁盘上无缓存但内存仍有数据，立即强制执行落盘以产生上传块
    if (diskFilesList_.empty() && !queue_.empty()) {
        persistMemoryQueueToDiskWithLock();
    }

    std::string targetFileName = "";
    for (const auto& name : diskFilesList_) {
        if (pendingUploads_.find(name) == pendingUploads_.end()) {
            targetFileName = name;
            break;
        }
    }

    if (targetFileName.empty()) {
        return {"", ""};
    }

    std::string targetFilePath = cacheDir_ + "/" + targetFileName;
    std::ifstream in(targetFilePath, std::ios::in | std::ios::binary);
    if (in.is_open()) {
        std::string encryptedContent((std::istreambuf_iterator<char>(in)),
                                     std::istreambuf_iterator<char>());
        in.close();

        // 1. 执行本地 AES-256 解密
        std::string decrypted = utils::Crypto::decryptAesGcm(encryptedContent, "RNlogsSecureSaltKey_2026");

        // 2. 解压 Gzip 原始多行字符串
        std::string rawLogs = utils::Compression::gzipDecompress(decrypted);

        // 3. 构建规范的 JSON 数组格式 "[log1,log2,...]" 返回给上层
        std::string jsonArray = "[";
        size_t start = 0;
        bool first = true;
        while (start < rawLogs.length()) {
            size_t end = rawLogs.find('\n', start);
            if (end == std::string::npos) {
                std::string last = rawLogs.substr(start);
                if (!last.empty()) {
                    if (!first) jsonArray += ",";
                    jsonArray += last;
                }
                break;
            }
            std::string line = rawLogs.substr(start, end - start);
            if (!line.empty()) {
                if (!first) jsonArray += ",";
                jsonArray += line;
                first = false;
            }
            start = end + 1;
        }
        jsonArray += "]";

        pendingUploads_[targetFileName] = targetFilePath;
        return {targetFileName, jsonArray};
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
                diskFilesList_.erase(std::remove(diskFilesList_.begin(), diskFilesList_.end(), batchId), diskFilesList_.end());
            } catch (...) {}
        }
        pendingUploads_.erase(it);
    }
}

void LogQueue::writeQueueToFd(int fd) {
    // 信号处理器中非阻塞尝试锁，如果失败也坚持输出以保护死锁状态下的崩溃现场数据
    bool locked = mutex_.try_lock();
    
    write(fd, "[", 1);
    bool first = true;
    for (const auto& log : queue_) {
        if (!first) {
            write(fd, ",", 1);
        }
        write(fd, log.data(), log.length());
        first = false;
    }
    write(fd, "]", 1);

    if (locked) {
        mutex_.unlock();
    }
}
