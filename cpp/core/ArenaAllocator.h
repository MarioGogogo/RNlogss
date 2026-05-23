#pragma once
#include <cstddef>
#include <vector>
#include <string_view>
#include <cstring>

namespace rnlogs {

class ArenaAllocator {
public:
    ArenaAllocator(size_t capacity = 1024 * 1024) : capacity_(capacity), offset_(0) {
        buffer_ = new char[capacity_];
    }

    ~ArenaAllocator() {
        delete[] buffer_;
    }

    char* alloc(size_t size) {
        if (offset_ + size > capacity_) {
            return nullptr; // 溢出
        }
        char* ptr = buffer_ + offset_;
        offset_ += size;
        return ptr;
    }

    std::string_view allocateString(const std::string& str) {
        char* dest = alloc(str.length() + 1);
        if (!dest) return "";
        std::memcpy(dest, str.c_str(), str.length());
        dest[str.length()] = '\0';
        return std::string_view(dest, str.length());
    }

    void reset() {
        offset_ = 0;
    }

    size_t usage() const {
        return offset_;
    }

private:
    char* buffer_;
    size_t capacity_;
    size_t offset_;
};

} // namespace rnlogs
