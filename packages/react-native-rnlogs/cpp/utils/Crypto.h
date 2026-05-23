#pragma once
#include <string>

namespace utils {

class Crypto {
public:
    // 将数据进行加密，若未启用或不支持则直接返回原始数据
    static std::string encryptAesGcm(const std::string& plainText, const std::string& key);
    static std::string decryptAesGcm(const std::string& cipherText, const std::string& key);
};

} // namespace utils
