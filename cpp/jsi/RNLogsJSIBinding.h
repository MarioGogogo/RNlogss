#pragma once
#include <jsi/jsi.h>
#include "../core/LogQueue.h"
#include <memory>

namespace facebook {
namespace jsi {

class RNLogsJSIBinding {
public:
    static void install(Runtime& runtime);
    static std::shared_ptr<LogQueue> getQueue();

private:
    static std::shared_ptr<LogQueue> queue_;
};

} // namespace jsi
} // namespace facebook
