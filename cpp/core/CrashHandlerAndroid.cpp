#include "CrashHandlerAndroid.h"
#include "CrashReporter.h"
#include <signal.h>
#include <string.h>
#include <unistd.h>
#include <android/log.h>

#ifdef LOG_TAG
#undef LOG_TAG
#endif
#define LOG_TAG "RNLogsCrash"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace rnlogs {

// 静态数组保存原有的信号处理设置
static struct sigaction oldActions[NSIG];

static const int CRASH_SIGNALS[] = {
    SIGSEGV,
    SIGABRT,
    SIGFPE,
    SIGILL,
    SIGBUS
};

static const size_t NUM_SIGNALS = sizeof(CRASH_SIGNALS) / sizeof(CRASH_SIGNALS[0]);

static const char* getSignalName(int sig) {
    switch (sig) {
        case SIGSEGV: return "SIGSEGV";
        case SIGABRT: return "SIGABRT";
        case SIGFPE: return "SIGFPE";
        case SIGILL: return "SIGILL";
        case SIGBUS: return "SIGBUS";
        default: return "UNKNOWN";
    }
}

static void nativeCrashHandler(int sig, siginfo_t* info, void* ucontext) {
    LOGE("Native crash detected! Signal: %d (%s)", sig, getSignalName(sig));

    // 调用 CrashReporter 记录崩溃数据
    CrashReporter::getInstance().writeCrashReportFromSignal(getSignalName(sig), "Native hardware exception occurred");

    // 卸载自定义信号处理器，恢复系统旧处理器
    for (size_t i = 0; i < NUM_SIGNALS; ++i) {
        sigaction(CRASH_SIGNALS[i], &oldActions[CRASH_SIGNALS[i]], nullptr);
    }

    // 重新向自身抛出该信号，交还给 Android 系统默认崩溃处理器生成 Tombstone
    kill(getpid(), sig);
}

void CrashHandlerAndroid::registerHandler() {
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_sigaction = nativeCrashHandler;
    sa.sa_flags = SA_SIGINFO | SA_ONSTACK;

    for (size_t i = 0; i < NUM_SIGNALS; ++i) {
        int sig = CRASH_SIGNALS[i];
        sigaction(sig, &sa, &oldActions[sig]);
    }
    LOGE("Registered Android signal CrashHandler.");
}

} // namespace rnlogs
