#pragma once
#include <string>

namespace utils {

class Compression {
public:
    // 将输入的数据进行 Gzip 压缩，若未开启或不支持则返回原数据（无损直通）
    static std::string gzipCompress(const std::string& data);
    static std::string gzipDecompress(const std::string& compressedData);
};

} // namespace utils
