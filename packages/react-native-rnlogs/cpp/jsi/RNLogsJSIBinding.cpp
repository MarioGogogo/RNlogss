#include "RNLogsJSIBinding.h"
#include <android/log.h>
#include "../core/BreadcrumbTracker.h"
#include "../core/CrashReporter.h"

#ifdef LOG_TAG
#undef LOG_TAG
#endif
#define LOG_TAG "RNLogsJSI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

namespace facebook {
namespace jsi {

std::shared_ptr<LogQueue> RNLogsJSIBinding::queue_ = nullptr;

std::shared_ptr<LogQueue> RNLogsJSIBinding::getQueue() {
    if (!queue_) {
        queue_ = std::make_shared<LogQueue>(1000);
    }
    return queue_;
}

void RNLogsJSIBinding::install(Runtime& runtime) {
    LOGI("RNLogsJSIBinding::install called");

    auto rnlogsInternal = Object(runtime);

    // 1. initialize
    auto initialize = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "initialize"),
        1,
        [](Runtime& rt, const Value& thisVal, const Value* args, size_t count) -> Value {
            // 在此阶段可先创建默认队列
            getQueue();
            return Value::undefined();
        }
    );
    rnlogsInternal.setProperty(runtime, "initialize", initialize);

    // 2. writeLog
    auto writeLog = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "writeLog"),
        1,
        [](Runtime& rt, const Value& thisVal, const Value* args, size_t count) -> Value {
            if (count > 0 && args[0].isString()) {
                std::string logData = args[0].asString(rt).utf8(rt);
                getQueue()->push(logData);
            }
            return Value::undefined();
        }
    );
    rnlogsInternal.setProperty(runtime, "writeLog", writeLog);

    // 3. writeLogBatch
    auto writeLogBatch = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "writeLogBatch"),
        1,
        [](Runtime& rt, const Value& thisVal, const Value* args, size_t count) -> Value {
            if (count > 0 && args[0].isString()) {
                std::string batchStr = args[0].asString(rt).utf8(rt);
                if (!batchStr.empty()) {
                    if (batchStr[0] != '[') {
                        getQueue()->push(batchStr);
                    } else {
                        // 使用括号匹配法分拆 JSON 数组
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
                                        std::string singleLog = batchStr.substr(start, i - start + 1);
                                        getQueue()->push(singleLog);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            return Value::undefined();
        }
    );
    rnlogsInternal.setProperty(runtime, "writeLogBatch", writeLogBatch);

    // 4. getQueueSize
    auto getQueueSize = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "getQueueSize"),
        0,
        [](Runtime& rt, const Value& thisVal, const Value* args, size_t count) -> Value {
            int size = (int)getQueue()->size();
            return Value(size);
        }
    );
    rnlogsInternal.setProperty(runtime, "getQueueSize", getQueueSize);

    // 5. flush
    auto flush = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "flush"),
        0,
        [](Runtime& rt, const Value& thisVal, const Value* args, size_t count) -> Value {
            getQueue()->persistMemoryQueue();
            return Value::undefined();
        }
    );
    rnlogsInternal.setProperty(runtime, "flush", flush);

    // 5.5 clear
    auto clear = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "clear"),
        0,
        [](Runtime& rt, const Value& thisVal, const Value* args, size_t count) -> Value {
            getQueue()->clear();
            return Value::undefined();
        }
    );
    rnlogsInternal.setProperty(runtime, "clear", clear);

    // 6. addBreadcrumb
    auto addBreadcrumb = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "addBreadcrumb"),
        2,
        [](Runtime& rt, const Value& thisVal, const Value* args, size_t count) -> Value {
            if (count > 0 && args[0].isString()) {
                std::string msg = args[0].asString(rt).utf8(rt);
                std::string cat = "default";
                if (count > 1 && args[1].isString()) {
                    cat = args[1].asString(rt).utf8(rt);
                }
                rnlogs::BreadcrumbTracker::getInstance().addBreadcrumb(msg, cat);
            }
            return Value::undefined();
        }
    );
    rnlogsInternal.setProperty(runtime, "addBreadcrumb", addBreadcrumb);

    // 7. hasPendingCrashReport
    auto hasPendingCrashReport = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "hasPendingCrashReport"),
        0,
        [](Runtime& rt, const Value& thisVal, const Value* args, size_t count) -> Value {
            bool has = rnlogs::CrashReporter::getInstance().hasPendingCrashReport();
            return Value(has);
        }
    );
    rnlogsInternal.setProperty(runtime, "hasPendingCrashReport", hasPendingCrashReport);

    // 8. consumeCrashReport
    auto consumeCrashReport = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "consumeCrashReport"),
        0,
        [](Runtime& rt, const Value& thisVal, const Value* args, size_t count) -> Value {
            std::string report = rnlogs::CrashReporter::getInstance().consumeCrashReport();
            return Value(String::createFromUtf8(rt, report));
        }
    );
    rnlogsInternal.setProperty(runtime, "consumeCrashReport", consumeCrashReport);

    // 9. triggerNativeCrash (Debug Only)
    auto triggerNativeCrash = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "triggerNativeCrash"),
        0,
        [](Runtime& rt, const Value& thisVal, const Value* args, size_t count) -> Value {
            volatile int* p = nullptr;
            *p = 0xDEAD; // 故意解引用空指针，产生 SIGSEGV 硬件信号
            return Value::undefined();
        }
    );
    rnlogsInternal.setProperty(runtime, "triggerNativeCrash", triggerNativeCrash);

    // 挂载到全局
    runtime.global().setProperty(runtime, "__rnlogsInternal", rnlogsInternal);
    LOGI("RNLogsJSIBinding: registered __rnlogsInternal into JS global");
}

} // namespace jsi
} // namespace facebook
