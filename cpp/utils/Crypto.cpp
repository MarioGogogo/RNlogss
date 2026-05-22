#include "Crypto.h"

namespace utils {

std::string Crypto::encryptAesGcm(const std::string& plainText, const std::string& key) {
    // 骨架实现：首版直接返回原始明文，后续可加入AES-GCM加密实现
    return plainText;
}

std::string Crypto::decryptAesGcm(const std::string& cipherText, const std::string& key) {
    return cipherText;
}

} // namespace utils
