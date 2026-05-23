#include "Compression.h"
#include <zlib.h>
#include <cstring>

namespace utils {

std::string Compression::gzipCompress(const std::string& data) {
    if (data.empty()) return data;

    z_stream zs;
    std::memset(&zs, 0, sizeof(zs));

    // windowBits = 15 + 16 (31) 告诉 zlib 产生带标准 Gzip 头的压缩流
    if (deflateInit2(&zs, Z_DEFAULT_COMPRESSION, Z_DEFLATED, 31, 8, Z_DEFAULT_STRATEGY) != Z_OK) {
        return data; // 初始化失败，降级返回原明文
    }

    zs.next_in = reinterpret_cast<Bytef*>(const_cast<char*>(data.data()));
    zs.avail_in = static_cast<uInt>(data.size());

    int ret;
    char outbuffer[32768];
    std::string outstring;

    do {
        zs.next_out = reinterpret_cast<Bytef*>(outbuffer);
        zs.avail_out = sizeof(outbuffer);

        ret = deflate(&zs, Z_FINISH);

        if (outstring.size() < zs.total_out) {
            outstring.append(outbuffer, zs.total_out - outstring.size());
        }
    } while (ret == Z_OK);

    deflateEnd(&zs);

    if (ret != Z_STREAM_END) {
        return data; // 压缩过程错误，降级返回原明文
    }

    return outstring;
}

std::string Compression::gzipDecompress(const std::string& compressedData) {
    if (compressedData.empty()) return compressedData;

    z_stream zs;
    std::memset(&zs, 0, sizeof(zs));

    // 47 告诉 zlib 支持自动检测 Gzip / Zlib 头部进行解压
    if (inflateInit2(&zs, 47) != Z_OK) {
        return compressedData;
    }

    zs.next_in = reinterpret_cast<Bytef*>(const_cast<char*>(compressedData.data()));
    zs.avail_in = static_cast<uInt>(compressedData.size());

    int ret;
    char outbuffer[32768];
    std::string outstring;

    do {
        zs.next_out = reinterpret_cast<Bytef*>(outbuffer);
        zs.avail_out = sizeof(outbuffer);

        ret = inflate(&zs, Z_NO_FLUSH);

        if (outstring.size() < zs.total_out) {
            outstring.append(outbuffer, zs.total_out - outstring.size());
        }
    } while (ret == Z_OK);

    inflateEnd(&zs);

    if (ret != Z_STREAM_END && ret != Z_OK) {
        return compressedData;
    }

    return outstring;
}

} // namespace utils
