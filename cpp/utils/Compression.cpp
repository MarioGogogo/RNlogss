#include "Compression.h"

namespace utils {

std::string Compression::gzipCompress(const std::string& data) {
    // 骨架实现：首版直接返回原始明文，后续若需压缩可引入zlib
    return data;
}

std::string Compression::gzipDecompress(const std::string& compressedData) {
    return compressedData;
}

} // namespace utils
