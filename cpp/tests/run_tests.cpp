#include <iostream>
#include <cassert>
#include <vector>
#include <string>
#include <memory>
#include "LogSerializer.h"
#include "LogQueue.h"
#include "Compression.h"
#include "Crypto.h"

// ==================== JSI mock ====================
// 在非 React Native 测试环境下 Mock RNLogsJSIBinding 以脱离 JSI 动态依赖
namespace facebook {
namespace jsi {
std::shared_ptr<LogQueue> RNLogsJSIBinding::queue_ = nullptr;
std::shared_ptr<LogQueue> RNLogsJSIBinding::getQueue() {
    if (!queue_) {
        queue_ = std::make_shared<LogQueue>(100);
    }
    return queue_;
}
}
}

using namespace rnlogs;
using namespace utils;

void testCompression() {
    std::string original = "hello, this is a very long log event message that we want to compress and decompress.";
    std::string compressed = Compression::gzipCompress(original);
    std::string decompressed = Compression::gzipDecompress(compressed);
    
    assert(!compressed.empty());
    assert(original == decompressed);
    std::cout << "[PASS] testCompression" << std::endl;
}

void testCrypto() {
    std::string original = "secret log data to check aes cbc";
    std::string key = "RNlogsSecureSaltKey_2026";
    std::string encrypted = Crypto::encryptAesGcm(original, key);
    std::string decrypted = Crypto::decryptAesGcm(encrypted, key);
    
    assert(!encrypted.empty());
    assert(original == decrypted);
    std::cout << "[PASS] testCrypto" << std::endl;
}

void testLogSerializer() {
    std::vector<std::string> logs = {
        "{\"id\":\"1\",\"type\":\"manual\",\"level\":1,\"message\":\"first log\"}",
        "{\"id\":\"2\",\"type\":\"manual\",\"level\":2,\"message\":\"second log\"}"
    };
    std::string pb = LogSerializer::serializeBatch(logs, "b1", "s1");
    assert(!pb.empty());
    // pb 编码的第一个字节一般是 Field Tag 等，检验其产生长度
    assert(pb.length() > 10);
    std::cout << "[PASS] testLogSerializer" << std::endl;
}

int main() {
    std::cout << "===========================================" << std::endl;
    std::cout << "Running RNLogs C++ Core Unit Tests..." << std::endl;
    std::cout << "===========================================" << std::endl;
    testCompression();
    testCrypto();
    testLogSerializer();
    std::cout << "All C++ Unit Tests Passed successfully!" << std::endl;
    return 0;
}
