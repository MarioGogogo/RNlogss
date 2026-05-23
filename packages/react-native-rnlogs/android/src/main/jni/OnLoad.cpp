#include <jni.h>
#include <jsi/jsi.h>

#include "RNLogsJSIBinding.h"
#include "CrashReporter.h"
#include "CrashHandlerAndroid.h"
#include "LogSerializer.h"

extern "C" JNIEXPORT __attribute__((visibility("default"))) void JNICALL
Java_com_rnlogss_RNLogsModule_nativeInstall(JNIEnv* env, jobject thiz, jlong jsiRuntimePtr, jstring jCacheDir) {
    auto runtime = reinterpret_cast<facebook::jsi::Runtime*>(jsiRuntimePtr);
    if (runtime) {
        facebook::jsi::RNLogsJSIBinding::install(*runtime);
    }

    if (jCacheDir != nullptr) {
        const char* cacheDirChars = env->GetStringUTFChars(jCacheDir, nullptr);
        if (cacheDirChars != nullptr) {
            std::string cacheDir(cacheDirChars);
            facebook::jsi::RNLogsJSIBinding::getQueue()->setCacheDir(cacheDir);
            
            // 初始化 C++ 崩溃报告并注册致命信号拦截器
            rnlogs::CrashReporter::getInstance().initialize(cacheDir);
            rnlogs::CrashHandlerAndroid::registerHandler();

            env->ReleaseStringUTFChars(jCacheDir, cacheDirChars);
        }
    }
}

extern "C" JNIEXPORT __attribute__((visibility("default"))) jboolean JNICALL
Java_com_rnlogss_RNLogsModule_nativeHasPendingCrashReport(JNIEnv* env, jobject thiz) {
    return rnlogs::CrashReporter::getInstance().hasPendingCrashReport() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT __attribute__((visibility("default"))) jstring JNICALL
Java_com_rnlogss_RNLogsModule_nativeConsumeCrashReport(JNIEnv* env, jobject thiz) {
    std::string report = rnlogs::CrashReporter::getInstance().consumeCrashReport();
    if (report.empty()) {
        return nullptr;
    }
    return env->NewStringUTF(report.c_str());
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_rnlogss_RNLogsModule_nativeFetchPbBatchToUpload(JNIEnv* env, jobject thiz) {
    auto batch = facebook::jsi::RNLogsJSIBinding::getQueue()->fetchNextBatch();
    if (batch.first.empty() || batch.second.empty()) {
        return nullptr;
    }

    // 拆分 JSON 数组得到各条事件
    std::vector<std::string> jsonLogs;
    std::string batchStr = batch.second;
    if (!batchStr.empty() && batchStr[0] == '[') {
        int braceCount = 0;
        size_t start = 0;
        bool inString = false;
        for (size_t i = 0; i < batchStr.length(); i++) {
            char c = batchStr[i];
            if (c == '"' && (i == 0 || batchStr[i-1] != '\\')) {
                inString = !inString;
            }
            if (!inString) {
                if (c == '{') {
                    if (braceCount == 0) {
                        start = i;
                    }
                    braceCount++;
                } else if (c == '}') {
                    braceCount--;
                    if (braceCount == 0) {
                        jsonLogs.push_back(batchStr.substr(start, i - start + 1));
                    }
                }
            }
        }
    } else if (!batchStr.empty()) {
        jsonLogs.push_back(batchStr);
    }

    // 序列化为 pb 二进制格式
    std::string pbData = rnlogs::LogSerializer::serializeBatch(jsonLogs, batch.first, "session_placeholder");

    // 封装结构：4字节大端长度 + batchId 字符 + pb 二进制
    uint32_t batchIdLen = batch.first.length();
    size_t totalSize = 4 + batchIdLen + pbData.length();

    std::vector<uint8_t> packet(totalSize);
    packet[0] = (batchIdLen >> 24) & 0xFF;
    packet[1] = (batchIdLen >> 16) & 0xFF;
    packet[2] = (batchIdLen >> 8) & 0xFF;
    packet[3] = batchIdLen & 0xFF;

    memcpy(packet.data() + 4, batch.first.c_str(), batchIdLen);
    memcpy(packet.data() + 4 + batchIdLen, pbData.data(), pbData.length());

    jbyteArray arr = env->NewByteArray(totalSize);
    env->SetByteArrayRegion(arr, 0, totalSize, reinterpret_cast<const jbyte*>(packet.data()));
    return arr;
}

extern "C" JNIEXPORT __attribute__((visibility("default"))) jstring JNICALL
Java_com_rnlogss_RNLogsModule_nativeFetchBatchToUpload(JNIEnv* env, jobject thiz) {
    auto batch = facebook::jsi::RNLogsJSIBinding::getQueue()->fetchNextBatch();
    if (batch.first.empty() || batch.second.empty()) {
        return nullptr;
    }
    // 打包成 JSON 格式回传给 Java 层，结构为：{"batchId": "xxx", "logs": [...]}
    std::string jsonResult = "{\"batchId\":\"" + batch.first + "\",\"logs\":" + batch.second + "}";
    return env->NewStringUTF(jsonResult.c_str());
}

extern "C" JNIEXPORT __attribute__((visibility("default"))) void JNICALL
Java_com_rnlogss_RNLogsModule_nativeConfirmUpload(JNIEnv* env, jobject thiz, jstring jBatchId, jboolean jSuccess) {
    if (jBatchId != nullptr) {
        const char* batchIdChars = env->GetStringUTFChars(jBatchId, nullptr);
        if (batchIdChars != nullptr) {
            std::string batchId(batchIdChars);
            facebook::jsi::RNLogsJSIBinding::getQueue()->confirmBatch(batchId, jSuccess == JNI_TRUE);
            env->ReleaseStringUTFChars(jBatchId, batchIdChars);
        }
    }
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
    return JNI_VERSION_1_6;
}
