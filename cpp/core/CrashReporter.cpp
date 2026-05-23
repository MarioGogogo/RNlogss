#include "CrashReporter.h"
#include "BreadcrumbTracker.h"
#include "../jsi/RNLogsJSIBinding.h"
#include <fstream>
#include <filesystem>
#include <chrono>
#include <fcntl.h>
#include <unistd.h>
#include <cstring>

namespace fs = std::filesystem;

namespace rnlogs {

namespace {
void safeWriteStr(int fd, const char* str) {
    if (str) {
        write(fd, str, strlen(str));
    }
}

void uint64ToString(uint64_t val, char* outBuf, size_t& len) {
    if (val == 0) {
        outBuf[0] = '0';
        outBuf[1] = '\0';
        len = 1;
        return;
    }
    char tmp[24];
    size_t i = 0;
    while (val > 0) {
        tmp[i++] = '0' + (val % 10);
        val /= 10;
    }
    len = i;
    for (size_t j = 0; j < i; ++j) {
        outBuf[j] = tmp[i - 1 - j];
    }
    outBuf[i] = '\0';
}
}

CrashReporter& CrashReporter::getInstance() {
    static CrashReporter instance;
    return instance;
}

void CrashReporter::initialize(const std::string& cacheDir) {
    cacheDir_ = cacheDir;
    try {
        if (!cacheDir_.empty() && !fs::exists(cacheDir_)) {
            fs::create_directories(cacheDir_);
        }
    } catch (...) {}
}

std::string CrashReporter::getCrashFilePath() const {
    if (cacheDir_.empty()) {
        return "";
    }
    return cacheDir_ + "/rnlogs_crash.dat";
}

bool CrashReporter::hasPendingCrashReport() const {
    std::string path = getCrashFilePath();
    if (path.empty()) return false;
    try {
        return fs::exists(path) && fs::is_regular_file(path);
    } catch (...) {
        return false;
    }
}

std::string CrashReporter::consumeCrashReport() {
    std::string path = getCrashFilePath();
    if (path.empty()) return "";
    
    std::string content = "";
    try {
        std::ifstream in(path, std::ios::in | std::ios::binary);
        if (in.is_open()) {
            content.assign((std::istreambuf_iterator<char>(in)),
                            std::istreambuf_iterator<char>());
            in.close();
            fs::remove(path);
        }
    } catch (...) {}
    return content;
}

void CrashReporter::writeCrashReportFromSignal(const char* signalName, const char* errorMsg) {
    std::string path = getCrashFilePath();
    if (path.empty()) return;

    // 信号处理上下文中，必须用底层的 open/write 以免重入 malloc
    int fd = open(path.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0666);
    if (fd < 0) return;

    uint64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    char tsStr[24];
    size_t tsLen = 0;
    uint64ToString(nowMs, tsStr, tsLen);

    safeWriteStr(fd, "{\"type\":\"crash\",\"timestamp\":");
    write(fd, tsStr, tsLen);
    
    safeWriteStr(fd, ",\"signal\":\"");
    safeWriteStr(fd, signalName);
    
    safeWriteStr(fd, "\",\"message\":\"");
    safeWriteStr(fd, errorMsg);
    
    safeWriteStr(fd, "\",\"breadcrumbs\":");
    BreadcrumbTracker::getInstance().writeBreadcrumbsToFd(fd);

    safeWriteStr(fd, ",\"logs\":");
    auto queue = facebook::jsi::RNLogsJSIBinding::getQueue();
    if (queue) {
        queue->writeQueueToFd(fd);
    } else {
        safeWriteStr(fd, "[]");
    }

    safeWriteStr(fd, "}");
    close(fd);
}

} // namespace rnlogs
